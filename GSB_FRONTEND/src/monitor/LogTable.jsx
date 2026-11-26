import { dateTime, ms } from './format'

const LEVEL = { error: 'critical', warn: 'warning', info: '' }

export default function LogTable({ items, showUser = false }) {
  if (!items.length) return <p className="muted empty">Aucune ligne de log.</p>
  // L'export simple (sans ?full=true) n'a pas la durée : on n'affiche la colonne que si elle existe.
  const showDuration = items.some((r) => r.duration_ms != null)
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Requête</th>
            <th className="num">Statut</th>
            {showDuration && <th className="num">Durée</th>}
            <th>Raison</th>
            {showUser && <th>Utilisateur</th>}
            <th>Request ID</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={`${r.request_id}-${r.created_at}-${i}`}>
              <td className="nowrap">{dateTime(r.created_at)}</td>
              <td><code>{r.method ?? ''} {r.route ?? r.action ?? ''}</code></td>
              <td className="num">
                {r.status != null && (
                  <span className={`chip ${r.status >= 500 ? 'critical' : r.status >= 400 ? 'warning' : ''}`}>{r.status}</span>
                )}
              </td>
              {showDuration && <td className="num nowrap">{r.duration_ms != null ? ms(r.duration_ms) : ''}</td>}
              <td>
                <span className={LEVEL[r.level] ? `chip ${LEVEL[r.level]}` : ''}>{r.reason ?? r.level ?? ''}</span>
                {r.action && r.reason !== r.action && <span className="muted small"> {r.action}</span>}
              </td>
              {showUser && <td><code className="small">{r.id_user ?? '–'}</code></td>}
              <td><code className="small">{r.request_id ?? '–'}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
