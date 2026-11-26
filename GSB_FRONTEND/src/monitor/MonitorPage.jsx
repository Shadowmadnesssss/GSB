// Page /monitor : supervision du backend (Auth Bus, Log Bus, Monitoring) via le SDK Bus TCL.
// Même session que l'application GSB (client `api`), réservée aux comptes admin.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, isBusError } from '../api'
import { API_URL } from '../config'
import { login, logout, setUser } from '../auth'
import MonitorDashboard from './MonitorDashboard.jsx'
import './monitor.css'

const REQUIRED_PERMISSIONS = ['logs:read', 'monitoring:read']
const useBus = () => useSyncExternalStore(api.subscribe, api.getState)

function loginMessage(err) {
  if (!isBusError(err) || err.kind === 'network') return `Serveur injoignable (${API_URL}).`
  if (err.kind === 'timeout') return 'Le serveur ne répond pas (Render se réveille peut-être, réessaie).'
  if (err.code === 'LOGIN_FAILED') return 'Email ou mot de passe incorrect.'
  if (err.code === 'LOGIN_LOCKED') {
    const minutes = Math.max(1, Math.ceil((err.retryAfterMs ?? 0) / 60000))
    return `Trop de tentatives. Réessaie dans ${minutes} min.`
  }
  return err.message
}

function MonitorLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(loginMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="center">
      <form className="card narrow" onSubmit={submit}>
        <h1>GSB Bus Monitor</h1>
        <p className="muted">Supervision du backend GSB (Auth Bus, Log Bus, Monitoring). Réservé aux administrateurs.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
        <a className="small muted" href="/login">← Retour à la connexion GSB</a>
      </form>
    </main>
  )
}

export default function MonitorPage() {
  const { status, user } = useBus()
  const [profileError, setProfileError] = useState(null)

  // Session restaurée (rechargement) : le SDK ne garde pas le profil, on le relit.
  useEffect(() => {
    if (status === 'authenticated' && !user) {
      api.auth.me().then((p) => setUser(p.user)).catch((err) => setProfileError(err))
    }
  }, [status, user])

  let content
  if (status !== 'authenticated') {
    content = <MonitorLogin />
  } else if (!user) {
    content = (
      <main className="center">
        <p className="muted">{profileError ? `Impossible de charger le profil : ${profileError.message}` : 'Chargement…'}</p>
      </main>
    )
  } else if (!api.auth.canSync(...REQUIRED_PERMISSIONS)) {
    content = (
      <main className="center">
        <div className="card narrow">
          <h1>Accès refusé</h1>
          <p className="muted">
            Le compte <strong>{user.email}</strong> n’est pas administrateur : le monitoring lui est fermé.
          </p>
          <a className="btn" href="/dashboard">Retour à GSB</a>
          <button className="btn" onClick={() => logout()}>Changer de compte</button>
        </div>
      </main>
    )
  } else {
    content = <MonitorDashboard user={user} />
  }

  return <div className="monitor">{content}</div>
}
