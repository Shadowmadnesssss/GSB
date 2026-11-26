import { useEffect, useState } from 'react'
import { api } from '../api'
import LogTable from './LogTable.jsx'

// Logs d'un utilisateur GSB et droits RGPD (accès art. 15, effacement art. 17).
export default function UserLogs() {
  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState('')
  const [logs, setLogs] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/users')
      .then((list) => setUsers(list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))))
      .catch((err) => setError(`Liste des utilisateurs indisponible : ${err.message}`))
  }, [])

  const selected = users.find((u) => u._id === userId)

  async function load(id = userId) {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await api.logs.exportUser(id, { limit: 200 })
      setLogs(res.items)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function exportFull() {
    try {
      const items = []
      for await (const row of api.logs.iterateUser(userId, { full: true, pageSize: 500 })) items.push(row)
      const blob = new Blob([JSON.stringify({ userId, email: selected?.email, exportedAt: new Date().toISOString(), items }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `logs-${userId}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setMessage(`${items.length} ligne(s) exportée(s). L’export est lui-même journalisé.`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function erase(kind) {
    const who = selected ? `${selected.name} (${selected.email})` : userId
    const text = kind === 'anonymize'
      ? `Anonymiser les logs de ${who} ? Les statistiques sont gardées, l’IP et l’identité sont effacées.`
      : `Supprimer définitivement tous les logs de ${who} ? C’est irréversible.`
    if (!window.confirm(text)) return
    setError('')
    try {
      const res = kind === 'anonymize' ? await api.logs.anonymizeUser(userId) : await api.logs.deleteUser(userId)
      setMessage(kind === 'anonymize' ? `${res.anonymized} ligne(s) anonymisée(s).` : `${res.deleted} ligne(s) supprimée(s).`)
      await load()
    } catch (err) {
      setError(err.isForbidden ? 'Permission logs:admin requise.' : err.message)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Logs par utilisateur (RGPD)</h2>
      </div>
      <div className="row">
        <select value={userId} onChange={(e) => { setUserId(e.target.value); setMessage(''); setLogs(null); load(e.target.value) }} aria-label="Utilisateur">
          <option value="">Choisir un utilisateur…</option>
          {users.map((u) => <option key={u._id} value={u._id}>{u.name} · {u.email} ({u.role})</option>)}
        </select>
        <button className="btn" disabled={!userId || loading} onClick={() => load()}>Recharger</button>
        <button className="btn" disabled={!userId} onClick={exportFull}>Exporter (JSON)</button>
        <button className="btn" disabled={!userId} onClick={() => erase('anonymize')}>Anonymiser</button>
        <button className="btn danger" disabled={!userId} onClick={() => erase('delete')}>Supprimer</button>
      </div>
      {message && <p className="ok" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {userId && logs && (
        <>
          <p className="muted small">
            {logs.length} ligne(s). Le Log Bus est sélectif : erreurs, routes sensibles et actions métier, pas chaque GET réussi.
          </p>
          <LogTable items={logs} />
        </>
      )}
    </section>
  )
}
