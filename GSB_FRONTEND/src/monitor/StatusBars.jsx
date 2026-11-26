import { num, splitStatusKey } from './format'

// Ce que signifie chaque statut de l'Auth Bus, pour lire le graphique sans la doc.
const HINTS = {
  AUTHENTICATED: 'token valide',
  PUBLIC_ROUTE: 'route publique',
  AUTHORIZED: 'permission accordée',
  NO_TOKEN: 'pas de token',
  MALFORMED: 'header mal formé',
  TOKEN_EXPIRED: 'token expiré',
  TOKEN_INVALID: 'token invalide',
  USER_NOT_FOUND: 'compte supprimé',
  USER_BANNED: 'compte banni',
  FORBIDDEN: 'permission refusée',
  INTERNAL_ERROR: 'erreur interne',
}

// Barres horizontales en HTML : une seule mesure (nombre d'événements), une seule teinte,
// triées par valeur. La valeur est écrite à côté de chaque barre.
export default function StatusBars({ monitoring }) {
  const rows = Object.entries(monitoring?.totals ?? {})
    .map(([key, value]) => ({ key, value, ...splitStatusKey(key) }))
    .sort((a, b) => b.value - a.value)
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div className="card">
      <div className="card-head">
        <h2>Événements du monitoring</h2>
        <span className="card-value">{num(monitoring?.received)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="muted empty">{monitoring ? 'Aucun événement reçu depuis le démarrage du serveur.' : 'Chargement…'}</p>
      ) : (
        <ul className="bars" aria-label="Événements par statut depuis le démarrage du serveur">
          {rows.map((r) => (
            <li key={r.key} className="bar-row" title={`${r.key} : ${num(r.value)}`}>
              <span className="bar-label">
                <code>{r.code}</code>
                <span className="muted small">{HINTS[r.code] ?? r.source}</span>
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
              <span className="bar-value">{num(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Depuis le dernier démarrage du serveur · rejetés : {num(monitoring?.rejected)}</p>
    </div>
  )
}
