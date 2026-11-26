import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { time } from './format'

function TrendTooltip({ active, payload, format }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="tooltip">
      <div className="muted small">{time(p.at)}</div>
      <div className="tooltip-value">{format(payload[0].value)}</div>
    </div>
  )
}

// Une seule série par graphique (le titre la nomme) : pas de légende, un seul axe.
export default function TrendChart({ title, data, dataKey, format }) {
  const last = data.at(-1)?.[dataKey]
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="card-value">{last === undefined ? '–' : format(last)}</span>
      </div>
      {data.length < 2 ? (
        <p className="muted empty">La courbe apparaît après deux relevés.</p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="at" type="number" domain={['dataMin', 'dataMax']} scale="time"
                tickFormatter={time} tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--axis)' }} tickLine={false} minTickGap={40} />
              <YAxis allowDecimals={false} width={56} tickFormatter={format}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<TrendTooltip format={format} />}
                cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} isAnimationActive={false} />
              <Line type="linear" dataKey={dataKey} stroke="var(--series-1)" strokeWidth={2}
                dot={false} activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }}
                isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
