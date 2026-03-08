require('dotenv').config()
const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const cors = require('cors')
const mongoose = require('mongoose')
const userRoute = require('./routes/user_route')
const authenticationRoute = require('./routes/authentication_route')
const billRoute = require('./routes/bill_route')

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

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

app.use(express.json())
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://gsb-hugo-stoeckels-projects.vercel.app',
    /\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use('/users', userRoute)
app.use('/auth', authenticationRoute)
app.use('/bills', billRoute)
app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
});