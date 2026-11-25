import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import {
  setupBuses,
  createBusApi,
  createCors,
  ConsoleNotifier,
  MultiNotifier,
  AUTH_SESSION_EVENTS,
} from './lib/bus-tcl/src/index.js'
import { createMongoUserStore, verifyUserPassword } from './bus/userStore.js'
import { registerUser } from './controllers/user_controller.js'
import userRoute from './routes/user_route.js'
import billRoute from './routes/bill_route.js'

const port = process.env.PORT || 3000

const secret = process.env.JWT_SECRET
if (!secret) {
  console.error('❌ JWT_SECRET is not defined')
  process.exit(1)
}

// Configuration MongoDB avec gestion d'erreur robuste
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error('MONGODB_URI or MONGO_URI environment variable is not defined');
    }

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
    });

    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('🔄 Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

connectDB();
const db = mongoose.connection;
db.on('error', (err) => {
  console.log('❌ MongoDB connection error:', err.message);
  if (err.name === 'MongoNetworkError') {
    console.log('🔄 Network error detected, retrying...');
  }
});
db.on('open', () => {
  console.log('✅ Connected to MongoDB successfully');
});
db.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

// ---------------------------------------------------------------------------
// Bus TCL : Auth Bus (JWT 15 min + refresh 7 j), Log Bus (RGPD), Monitoring.
// ---------------------------------------------------------------------------
const users = createMongoUserStore()

const api = createBusApi({
  secret,
  auth: {
    users,
    verifyPassword: verifyUserPassword, // accepte les anciens hash sha256 et les migre en scrypt
    tokens: { accessTokenTtlSec: 15 * 60, refreshTokenTtlMs: 7 * 24 * 3600 * 1000 },
  },
})

const app = express()
// Render est derrière un proxy : req.ip doit être l'IP du client (anti-bruteforce, logs).
app.set('trust proxy', true)

// CORS avant les bus : les pré-vols OPTIONS n'ont pas de token.
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://gsb-hugo-stoeckels-projects.vercel.app',
]
app.use(createCors({
  origins: (origin) => allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin),
}))

const ctx = setupBuses(app, {
  auth: {
    secret,
    users,
    publicRoutes: [...api.publicRoutes, '/auth/register'],
  },
  log: { retentionDays: 180 },
  monitor: { notifier: new MultiNotifier([new ConsoleNotifier(), api.alertHistory.notifier]) },
  registerRoutes(app, routeCtx) {
    // /auth/login, /auth/refresh, /auth/logout, /auth/logout-all, /auth/me, /auth/me/logs,
    // /admin/logs/*, /admin/monitoring/*
    api.register(app, routeCtx)

    app.post('/auth/register', registerUser)
    app.use('/users', userRoute)
    app.use('/bills', billRoute)
  },
})

ctx.events.on(AUTH_SESSION_EVENTS.of('LOGIN_FAILED'), (e) => {
  console.warn(`[sécurité] échec de connexion depuis ${e.ip}`)
})

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
});

// Graceful shutdown : vide les logs en attente, puis ferme MongoDB
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    try {
      await ctx.shutdown(server)
      await mongoose.connection.close()
      console.log('MongoDB connection closed.')
    } finally {
      process.exit(0)
    }
  })
}
