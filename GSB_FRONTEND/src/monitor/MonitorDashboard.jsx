import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { API_URL } from '../config'
import { logout } from '../auth'
import { num, pct, ms, time } from './format'
import Kpi from './Kpi.jsx'
import TrendChart from './TrendChart.jsx'
import StatusBars from './StatusBars.jsx'
import Alerts from './Alerts.jsx'
import RequestLookup from './RequestLookup.jsx'
import UserLogs from './UserLogs.jsx'

const INTERVALS = [
  { label: '5 s', ms: 5_000 },
  { label: '15 s', ms: 15_000 },
  { label: '60 s', ms: 60_000 },
  { label: 'Pause', ms: 0 },
]
const MAX_POINTS = 120

export default function MonitorDashboard({ user }) {
  const [intervalMs, setIntervalMs] = useState(15_000)
  const [stats, setStats] = useState(null)
  const [monitoring, setMonitoring] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [history, setHistory] = useState([])
  const [lastAt, setLastAt] = useState(null)
  const [error, setError] = useState(null)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const [s, m, a] = await Promise.all([
        api.logs.getStats(),
        api.monitoring.getStats(),
        api.monitoring.getAlerts({ limit: 50 }),
      ])
      const at = Date.now()
      setStats(s)
      setMonitoring(m)
      setAlerts(a.items)
      setLastAt(at)
      setError(null)
      setHistory((h) => [...h, {
        at,
        requests: s.requests_total,
        p95: s.latency_ms.p95,
        errors: s.errors_4xx + s.errors_5xx,
      }].slice(-MAX_POINTS))
    } catch (err) {
      setError(err)
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    if (!intervalMs) return undefined
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, refresh])

  const windowMin = stats ? Math.round(stats.window_ms / 60000) : 5
  const buffer = stats?.buffer

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>GSB Bus Monitor</h1>
          <p className="muted small">
            {new URL(API_URL).host} · {lastAt ? `mis à jour à ${time(lastAt)}` : 'chargement…'}
          </p>
        </div>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Rafraîchissement">
            {INTERVALS.map((it) => (
              <button
                key={it.label}
                className={it.ms === intervalMs ? 'active' : ''}
                aria-pressed={it.ms === intervalMs}
                onClick={() => setIntervalMs(it.ms)}
              >{it.label}</button>
            ))}
          </div>
          <button className="btn" onClick={refresh}>Rafraîchir</button>
          <a className="btn" href="/dashboard">Ouvrir GSB</a>
          <span className="muted small">{user.email}</span>
          <button className="btn" onClick={() => logout()}>Déconnexion</button>
        </div>
      </header>

      {error && (
        <p className="banner" role="alert">
          Dernier rafraîchissement en échec : {error.message}
          {error.requestId ? ` (requête ${error.requestId})` : ''}
        </p>
      )}

      <section className="kpis" aria-label={`Indicateurs sur ${windowMin} min`}>
        <Kpi label={`Requêtes (${windowMin} min)`} value={num(stats?.requests_total)}
          note={stats ? `${num(stats.requests_logged)} journalisées` : ''} />
        <Kpi label="Erreurs 5xx" value={num(stats?.errors_5xx)}
          note={stats ? `taux ${pct(stats.error_rate_5xx)} · 4xx : ${num(stats.errors_4xx)}` : ''}
          status={stats?.errors_5xx > 0 ? 'critical' : null} />
        <Kpi label="Échecs d’auth" value={num(stats?.auth_failures)}
          note={stats ? `limités (429) : ${num(stats.rate_limited)}` : ''}
          status={stats?.auth_failures > 0 ? 'warning' : null} />
        <Kpi label="Latence p95" value={ms(stats?.latency_ms.p95)}
          note={stats ? `p50 ${ms(stats.latency_ms.p50)} · max ${ms(stats.latency_ms.max)}` : ''} />
        <Kpi label="Requêtes lentes" value={num(stats?.slow_requests)}
          note={stats ? `annulées : ${num(stats.aborted_requests)}` : ''} />
        <Kpi label="Tampon de logs" value={num(buffer ? buffer.pending + buffer.in_flight : null)}
          note={buffer ? `perdues : ${num(buffer.dropped)} · échecs : ${num(buffer.flushes_failed)}` : ''}
          status={buffer?.dropped > 0 ? 'serious' : null} />
      </section>

      <section className="grid two">
        <TrendChart title={`Requêtes sur ${windowMin} min glissantes`} data={history} dataKey="requests" format={num} />
        <TrendChart title="Latence p95" data={history} dataKey="p95" format={ms} />
      </section>
      <p className="muted small note">
        Les courbes sont relevées par ce dashboard à chaque rafraîchissement, tant que l’onglet est ouvert.
        Ses propres appels (3 par rafraîchissement) comptent dans les requêtes.
      </p>

      <section className="grid two">
        <StatusBars monitoring={monitoring} />
        <Alerts alerts={alerts} />
      </section>

      <RequestLookup />
      <UserLogs />
    </div>
  )
}
