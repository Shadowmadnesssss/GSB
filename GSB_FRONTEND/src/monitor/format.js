const nf = new Intl.NumberFormat('fr-FR')
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 2 })
const tf = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dtf = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })

export const num = (n) => (Number.isFinite(n) ? nf.format(n) : '–')
export const pct = (n) => (Number.isFinite(n) ? pf.format(n) : '–')
export const ms = (n) => (Number.isFinite(n) ? `${nf.format(Math.round(n))} ms` : '–')
export const time = (t) => tf.format(new Date(t))
export const dateTime = (t) => (t ? dtf.format(new Date(t)) : '–')

// "auth:TOKEN_INVALID" -> { source: "auth", code: "TOKEN_INVALID" }
export function splitStatusKey(key) {
  const i = key.indexOf(':')
  return i === -1 ? { source: '', code: key } : { source: key.slice(0, i), code: key.slice(i + 1) }
}
