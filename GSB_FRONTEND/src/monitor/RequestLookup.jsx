import { useState } from 'react'
import { api } from '../api'
import LogTable from './LogTable.jsx'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Un "code support" affiché à un utilisateur (err.requestId côté front) -> tout ce que le serveur sait.
export default function RequestLookup() {
  const [id, setId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function search(e) {
    e.preventDefault()
    const value = id.trim()
    setError('')
    setResult(null)
    if (!UUID.test(value)) { setError('Un request ID est un UUID, ex. 3f2b8c1e-…'); return }
    setLoading(true)
    try {
      setResult(await api.logs.getRequest(value))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Retrouver une requête</h2>
      </div>
      <p className="muted small">
        Chaque appel du SDK porte un <code>x-request-id</code>. Colle celui d’une erreur pour voir ce que le serveur a journalisé.
      </p>
      <form className="row" onSubmit={search}>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="request ID (UUID)" aria-label="Request ID" />
        <button className="btn primary" disabled={loading}>{loading ? 'Recherche…' : 'Rechercher'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <>
          <p className="muted small">{result.count} ligne(s) pour {result.requestId}</p>
          <LogTable items={result.items} showUser />
        </>
      )}
    </section>
  )
}
