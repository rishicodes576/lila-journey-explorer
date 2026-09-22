import type { HeatmapMode } from './types'

/** Deep-linkable view state — makes any view shareable via its URL. */
export interface UrlState {
  map: string
  date: string
  matchId: string | null
  heatmap: HeatmapMode
}

export function readUrl(): Partial<UrlState> {
  const p = new URLSearchParams(location.search)
  return {
    map: p.get('map') || undefined,
    date: p.get('date') || undefined,
    matchId: p.get('match') || undefined,
    heatmap: (p.get('heat') as HeatmapMode) || undefined,
  }
}

let last = ''
export function writeUrl(s: UrlState) {
  const p = new URLSearchParams()
  if (s.map) p.set('map', s.map)
  if (s.date && s.date !== 'all') p.set('date', s.date)
  if (s.matchId) p.set('match', s.matchId)
  if (s.heatmap && s.heatmap !== 'traffic') p.set('heat', s.heatmap)
  const qs = p.toString()
  if (qs === last) return // avoid history spam (e.g. during playback frames)
  last = qs
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname)
}
