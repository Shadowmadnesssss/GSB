// Tests de bout en bout : le SDK bus-tcl (copie utilisée par le front) contre le vrai backend GSB.
//
//   npm test
//
// MongoDB tourne en mémoire (mongodb-memory-server-core) : jamais la BDD de prod.
// Le .env du backend n'est pas chargé, et S3 reçoit de faux identifiants (aucun upload réel).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { MongoMemoryServer } from 'mongodb-memory-server-core'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import {
  createBusClient, memoryStorage, isBusError, BusError,
} from '../../GSB_FRONTEND/src/lib/bus-tcl/sdk/index.js'

const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url))
const PORT = 3900 + Math.floor(Math.random() * 90)
const BASE = `http://127.0.0.1:${PORT}`
const SECRET = 'test-secret-0123456789-0123456789-abcd'
const SALT = 'test-legacy-salt'
const VERCEL_ORIGIN = 'https://gsb-hugo-stoeckels-projects.vercel.app'
// Ancien format GSB (avant bus-tcl) : sha256(password + SALT)
const legacy = (pw) => createHash('sha256').update(pw + SALT).digest('hex')

let mongo, proc, conn
let logs = ''
const ids = {}

before(async () => {
  mongo = await MongoMemoryServer.create()
  const uri = mongo.getUri('gsb')
  conn = await mongoose.createConnection(uri).asPromise()

  const users = conn.collection('users')
  ids.admin = (await users.insertOne({ name: 'Admin', email: 'Admin@gmail.com', password: legacy('Admin/123'), role: 'admin', createdAt: '1' })).insertedId
  ids.user = (await users.insertOne({ name: 'User Test', email: 'user_test@gmail.com', password: legacy('User/123'), role: 'USER', createdAt: '1' })).insertedId
  const bills = conn.collection('bills')
  ids.billAdmin = (await bills.insertOne({ date: '2025-01-01', amount: 10, proof: 'https://bkt.s3.eu-north-1.amazonaws.com/a.png', description: 'repas admin', user: ids.admin, status: 'Pending', type: 'Repas' })).insertedId
  ids.billUser = (await bills.insertOne({ date: '2025-01-02', amount: 20, proof: 'https://bkt.s3.eu-north-1.amazonaws.com/b.png', description: 'train user', user: ids.user, status: 'Pending', type: 'Transport' })).insertedId

  proc = spawn(process.execPath, ['index.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: fileURLToPath(new URL('./no-such.env', import.meta.url)),
      PORT: String(PORT), MONGO_URI: uri, MONGODB_URI: uri, JWT_SECRET: SECRET, SALT,
      ID: 'x', SECRET: 'x', BUCKET_NAME: 'bkt', AWS_REGION: 'eu-north-1',
      SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
    },
  })
  proc.stdout.on('data', (d) => { logs += d })
  proc.stderr.on('data', (d) => { logs += d })
  for (let i = 0; i < 300; i++) {
    if (logs.includes('Connected to MongoDB') && logs.includes('Server is running')) return
    if (proc.exitCode !== null) break
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Le backend n'a pas démarré :\n${logs}`)
})

after(async () => {
  proc?.kill()
  await conn?.close()
  await mongo?.stop()
})

const client = (extra = {}) => createBusClient({ baseUrl: BASE, storage: memoryStorage(), retries: 0, ...extra })
const loginAs = async (email, password, extra) => {
  const api = client(extra)
  await api.auth.login(email, password)
  return api
}
const adminClient = () => loginAs('Admin@gmail.com', 'Admin/123')
const passwordOf = async (email) => (await conn.collection('users').findOne({ email })).password

// --- Session -------------------------------------------------------------------------------

test('health : public, sans token', async () => {
  const h = await client().health()
  assert.equal(h.ok, true)
  assert.ok(h.stats)
})

test('login avec un ancien compte sha256 : profil GSB, permissions, migration en scrypt', async () => {
  assert.match(await passwordOf('Admin@gmail.com'), /^[0-9a-f]{64}$/)
  const api = client()
  const { user, permissions } = await api.auth.login('Admin@gmail.com', 'Admin/123')
  assert.equal(user._id, String(ids.admin))
  assert.equal(user.id, String(ids.admin))
  assert.equal(user.name, 'Admin')
  assert.equal(user.email, 'Admin@gmail.com')
  assert.equal(user.role, 'admin')
  assert.equal(user.passwordHash, undefined)
  assert.deepEqual(permissions, ['*'])
  assert.equal(api.auth.isAuthenticated, true)
  assert.equal(api.auth.canSync('logs:read'), true)
  assert.match(await passwordOf('Admin@gmail.com'), /^scrypt\$/)
  await loginAs('Admin@gmail.com', 'Admin/123') // le hash migré fonctionne
})

test('mauvais identifiants : BusError LOGIN_FAILED, onAuthError non appelé', async () => {
  let authErrors = 0
  const api = client({ onAuthError: () => authErrors++ })
  await assert.rejects(api.auth.login('Admin@gmail.com', 'faux'),
    (e) => isBusError(e) && e instanceof BusError && e.code === 'LOGIN_FAILED' && e.kind === 'auth')
  await assert.rejects(api.auth.login('inconnu@x.fr', 'faux'), (e) => e.code === 'LOGIN_FAILED')
  assert.equal(authErrors, 0)
  assert.equal(api.auth.isAuthenticated, false)
})

test('état réactif : subscribe / getState suivent login et logout', async () => {
  const api = client()
  const statuses = []
  api.subscribe((s) => statuses.push(s.status))
  assert.equal(api.getState().status, 'anonymous')
  await api.auth.login('Admin@gmail.com', 'Admin/123')
  assert.equal(api.getState().status, 'authenticated')
  assert.equal(api.getState().user.email, 'Admin@gmail.com')
  assert.equal(api.getState(), api.getState()) // même objet tant que rien ne change
  await api.auth.logout()
  assert.equal(api.getState().status, 'anonymous')
  assert.deepEqual([...new Set(statuses)], ['authenticated', 'anonymous'])
})

test('refresh, /auth/me puis logout : le refresh token est révoqué côté serveur', async () => {
  const api = await adminClient()
  const before = api.token
  assert.equal(await api.auth.refresh(), true)
  assert.notEqual(api.token, before)
  const me = await api.auth.me({ refresh: true })
  assert.equal(me.user.email, 'Admin@gmail.com')
  const { refreshToken } = api.session
  await api.auth.logout()
  assert.equal(api.auth.isAuthenticated, false)
  const r = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }),
  })
  assert.equal(r.status, 401)
})

test('token expiré : le SDK rafraîchit seul puis rejoue la requête', async () => {
  const api = await adminClient()
  const expired = jwt.sign({ sub: String(ids.admin), role: 'admin' }, SECRET, { expiresIn: -10 })
  const stale = client({ storage: memoryStorage({ ...api.session, accessToken: expired, expiresAt: Date.now() + 3600e3 }) })
  const bills = await stale.get('/bills')
  assert.equal(bills.length, 2)
  assert.notEqual(stale.token, expired)
})

test('session morte : onAuthError appelé et session effacée', async () => {
  let authErrors = 0
  const forged = jwt.sign({ sub: String(ids.admin), role: 'admin' }, 'mauvais-secret', { expiresIn: 60 })
  const api = client({ token: forged, onAuthError: () => authErrors++ })
  await assert.rejects(api.get('/bills'), (e) => e.kind === 'auth' && e.code === 'TOKEN_INVALID')
  assert.equal(authErrors, 1)
  assert.equal(api.auth.isAuthenticated, false)
})

test('ancien JWT GSB (24h, sans sub) et requête sans token : 401', async () => {
  const old = jwt.sign({ id: String(ids.admin), role: 'admin', email: 'Admin@gmail.com' }, SECRET, { expiresIn: '24h' })
  assert.equal((await fetch(`${BASE}/bills`, { headers: { authorization: `Bearer ${old}` } })).status, 401)
  assert.equal((await fetch(`${BASE}/bills`)).status, 401)
})

// --- Mécanique du SDK --------------------------------------------------------------------

test('x-request-id : envoyé par le SDK et repris par le serveur', async () => {
  const api = await adminClient()
  const seen = []
  const res = await api.get('/bills', { raw: true })
  assert.equal(res.status, 200)
  assert.match(res.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(res.headers.get('x-request-id'), res.requestId)
  assert.equal(api.lastRequestId, res.requestId)
  const remove = api.use({ afterResponse: (info) => seen.push(info) })
  await api.get('/bills')
  remove()
  assert.equal(seen.length, 1)
  assert.equal(seen[0].status, 200)
  assert.equal(seen[0].path, '/bills')
  assert.ok(seen[0].durationMs >= 0)
})

test('onResponse et intercepteur beforeRequest', async () => {
  const seen = []
  const api = await loginAs('Admin@gmail.com', 'Admin/123', { onResponse: (i) => seen.push(`${i.method} ${i.path} ${i.status}`) })
  api.use({ beforeRequest: (req) => { req.headers['x-test'] = '1' } })
  await api.get('/bills')
  assert.ok(seen.includes('POST /auth/login 200'))
  assert.ok(seen.includes('GET /bills 200'))
})

test('serveur injoignable : kind "network" ; trop lent : kind "timeout"', async () => {
  const down = createBusClient({ baseUrl: 'http://127.0.0.1:9', retries: 0 })
  await assert.rejects(down.health(), (e) => e.kind === 'network')
  const slow = createBusClient({
    baseUrl: BASE, retries: 0, timeoutMs: 50,
    fetch: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }),
  })
  await assert.rejects(slow.health(), (e) => e.kind === 'timeout')
})

test('annulation par AbortSignal : kind "aborted"', async () => {
  const api = await adminClient()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(api.get('/bills', { signal: controller.signal }), (e) => e.kind === 'aborted')
})

test('erreurs typées : 404 "http", 403 "forbidden", 400 "validation"', async () => {
  const user = await loginAs('user_test@gmail.com', 'User/123')
  await assert.rejects(user.get('/bills/000000000000000000000000'), (e) => e.kind === 'http' && e.status === 404)
  await assert.rejects(user.get(`/bills/${ids.billAdmin}/proof-url`), (e) => e.kind === 'forbidden')
  const fd = new FormData()
  fd.append('metadata', JSON.stringify({ amount: 5, date: '2025-02-02', type: 'Repas', description: 'x', status: 'Pending' }))
  await assert.rejects(user.post('/bills', fd), (e) => e.kind === 'validation' && e.message === 'Proof image is required')
  assert.equal(user.auth.isAuthenticated, true) // aucune de ces erreurs ne déconnecte
})

// --- Routes GSB à travers le SDK ---------------------------------------------------------

test('bills : un admin voit tout, un user seulement les siennes', async () => {
  const admin = await adminClient()
  const user = await loginAs('user_test@gmail.com', 'User/123')
  assert.equal((await admin.get('/bills')).length, 2)
  const mine = await user.get('/bills')
  assert.equal(mine.length, 1)
  assert.equal(mine[0].description, 'train user')
  assert.equal(mine[0].user.email, 'user_test@gmail.com')
})

test('statut : PUT /bills/:id { status } appliqué pour un admin seulement, autres champs intacts', async () => {
  const admin = await adminClient()
  const user = await loginAs('user_test@gmail.com', 'User/123')
  const id = String(ids.billUser)
  assert.equal((await user.put(`/bills/${id}`, { status: 'Approved' })).status, 'Pending')
  const updated = await admin.put(`/bills/${id}`, { status: 'Approved' })
  assert.equal(updated.status, 'Approved')
  assert.equal(updated.amount, 20)
  assert.equal(updated.description, 'train user')
  assert.equal(updated.date, '2025-01-02')
})

test('proof-url : URL S3 signée pour le propriétaire', async () => {
  const user = await loginAs('user_test@gmail.com', 'User/123')
  const { url } = await user.get(`/bills/${ids.billUser}/proof-url`)
  assert.match(url, /X-Amz-Signature/)
})

test('inscription publique : rôle forcé à USER, pas de hash renvoyé, doublon refusé', async () => {
  const anon = client()
  const created = await anon.post('/auth/register', { name: 'New', email: 'new@x.fr', password: 'Passw0rd!', role: 'admin' }, { auth: false })
  assert.equal(created.role, 'USER')
  assert.equal(created.password, undefined)
  assert.match(await passwordOf('new@x.fr'), /^scrypt\$/)
  const { user } = await client().auth.login('new@x.fr', 'Passw0rd!')
  assert.equal(user.role, 'USER')
  await assert.rejects(anon.post('/auth/register', { name: 'New', email: 'new@x.fr', password: 'x' }, { auth: false }),
    (e) => e.status === 400)
})

test('users : jamais de hash dans les réponses ; POST /users réservé aux admins', async () => {
  const admin = await adminClient()
  const user = await loginAs('user_test@gmail.com', 'User/123')
  const list = await user.get('/users')
  assert.ok(list.length >= 2)
  assert.ok(list.every((u) => u.password === undefined && typeof u.billsCount === 'number'))
  await assert.rejects(user.post('/users', { name: 'h', email: 'h@x.fr', password: 'p', role: 'admin' }), (e) => e.kind === 'forbidden')
  const made = await admin.post('/users', { name: 'Made', email: 'made@x.fr', password: 'p', role: 'admin' })
  assert.equal(made.role, 'admin')
  assert.equal(made.password, undefined)
})

test('mot de passe : ancien faux = 400 sans déconnexion, puis changement réel', async () => {
  let authErrors = 0
  const user = await loginAs('user_test@gmail.com', 'User/123', { onAuthError: () => authErrors++ })
  await assert.rejects(
    user.put('/users/password', { email: 'user_test@gmail.com', currentPassword: 'faux', newPassword: 'NewPass1' }),
    (e) => e.kind === 'validation' && e.message === 'Incorrect old password',
  )
  assert.equal(authErrors, 0)
  assert.equal(user.auth.isAuthenticated, true)
  await user.put('/users/password', { email: 'user_test@gmail.com', currentPassword: 'User/123', newPassword: 'NewPass1' })
  await loginAs('user_test@gmail.com', 'NewPass1')
  await assert.rejects(client().auth.login('user_test@gmail.com', 'User/123'), (e) => e.code === 'LOGIN_FAILED')
})

test('admin : reset de mot de passe et PUT /users avec mot de passe (haché)', async () => {
  const admin = await adminClient()
  await admin.put('/users/password', { email: 'user_test@gmail.com', newPassword: 'Reset123', isAdminReset: true })
  await loginAs('user_test@gmail.com', 'Reset123')
  const updated = await admin.put('/users', { name: 'User Renamed', password: 'Edit1234' }, { query: { email: 'user_test@gmail.com' } })
  assert.equal(updated.name, 'User Renamed')
  assert.equal(updated.password, undefined)
  assert.match(await passwordOf('user_test@gmail.com'), /^scrypt\$/)
  await loginAs('user_test@gmail.com', 'Edit1234')
})

test('logs RGPD et monitoring : admin OK, user 403, mes logs accessibles', async () => {
  const admin = await adminClient()
  const user = await loginAs('new@x.fr', 'Passw0rd!')
  assert.ok((await admin.monitoring.getStats()).received > 0)
  assert.ok(Array.isArray((await admin.monitoring.getAlerts({ limit: 5 })).items))
  await admin.logs.getStats()
  await assert.rejects(user.monitoring.getStats(), (e) => e.kind === 'forbidden')
  await assert.rejects(user.logs.getStats(), (e) => e.kind === 'forbidden')
  await user.auth.myLogs({ limit: 10 })
})

test('CORS : Vercel et localhost autorisés (x-request-id compris), autres origines refusées', async () => {
  const pre = await fetch(`${BASE}/bills`, {
    method: 'OPTIONS',
    headers: {
      origin: VERCEL_ORIGIN,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization,content-type,x-request-id',
    },
  })
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-origin'), VERCEL_ORIGIN)
  assert.match(pre.headers.get('access-control-allow-headers'), /x-request-id/)
  assert.match(pre.headers.get('access-control-allow-methods'), /PUT/)
  for (const origin of ['http://localhost:5173', 'https://gsb-git-main-x.vercel.app']) {
    const r = await fetch(`${BASE}/health`, { headers: { origin } })
    assert.equal(r.headers.get('access-control-allow-origin'), origin)
  }
  const evil = await fetch(`${BASE}/health`, { headers: { origin: 'https://evil.example' } })
  assert.equal(evil.headers.get('access-control-allow-origin'), null)
})

test('DELETE /bills/:id', async () => {
  const admin = await adminClient()
  assert.equal((await admin.delete(`/bills/${ids.billAdmin}`)).message, 'Bill deleted')
  assert.equal((await admin.get('/bills')).length, 1)
})

test('aucun mot de passe ni hash dans les logs du serveur', () => {
  assert.doesNotMatch(logs, /scrypt\$/)
  assert.doesNotMatch(logs, /Admin\/123|User\/123|NewPass1|Passw0rd!|Reset123|Edit1234/)
})
