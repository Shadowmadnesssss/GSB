import { useState } from 'react'
import { dateTime } from './format'

const SEVERITY = {
  info: { label: 'Info', icon: 'i', cls: 'info' },
  warn: { label: 'Avertissement', icon: '!', cls: 'warning' },
  error: { label: 'Erreur', icon: '×', cls: 'critical' },
}

export default function Alerts({ alerts }) {
  const [filter, setFilter] = useState('all')
  const items = (alerts ?? []).filter((a) => filter === 'all' || a.severity === filter)

  return (
    <div className="card">
      <div className="card-head">
        <h2>Alertes</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer par gravité">
          <option value="all">Toutes</option>
          <option value="error">Erreurs</option>
          <option value="warn">Avertissements</option>
          <option value="info">Info</option>
        </select>
      </div>
      {alerts === null ? (
        <p className="muted empty">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="muted empty">Aucune alerte{filter !== 'all' ? ' pour ce filtre' : ''}. Les seuils sont dans rules.json du backend.</p>
      ) : (
        <ul className="alerts">
          {items.map((a, i) => {
            const s = SEVERITY[a.severity] ?? SEVERITY.info
            return (
              <li key={`${a.at}-${a.ruleId}-${i}`}>
                <span className={`chip ${s.cls}`}><span aria-hidden="true">{s.icon}</span> {s.label}</span>
                <div>
                  <div>{a.message}</div>
                  <div className="muted small">
                    {dateTime(a.createdAt ?? a.at)} · règle <code>{a.ruleId}</code>{a.key ? ` · clé ${a.key}` : ''}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
