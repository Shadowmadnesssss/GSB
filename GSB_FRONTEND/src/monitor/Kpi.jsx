const STATUS_LABEL = { warning: 'À surveiller', serious: 'Attention', critical: 'Erreur' }
const STATUS_ICON = { warning: '!', serious: '!', critical: '×' }

export default function Kpi({ label, value, note, status = null }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-note">
        {status && (
          <span className={`chip ${status}`}>
            <span aria-hidden="true">{STATUS_ICON[status]}</span> {STATUS_LABEL[status]}
          </span>
        )}
        <span className="muted small">{note}</span>
      </div>
    </div>
  )
}
