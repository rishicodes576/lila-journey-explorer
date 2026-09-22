export const nf = new Intl.NumberFormat('en-US')
export const num = (n: number) => nf.format(n)

export const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + '%' : '0%')

/** short label for a match id (uuid) */
export const shortId = (id: string) => id.slice(0, 8)

export const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** match ts is compressed (~sub-second). Show a readable "match time" read-out. */
export const fmtMatchTime = (ms: number) => {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
