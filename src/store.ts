import { create } from 'zustand'
import type { Manifest, MapData, MatchData, HeatmapMode } from './lib/types'
import { fetchManifest, fetchMapData, fetchMatchData } from './lib/data'
import { readUrl } from './lib/url'

/** Full match at 1x speed plays over this many wall-clock ms (match ts is ~sub-second). */
export const BASE_PLAY_MS = 12000

export interface LayerToggles {
  humans: boolean
  bots: boolean
  events: boolean
  movement: boolean
  dimMap: boolean
}

interface AppState {
  // data
  manifest: Manifest | null
  mapData: MapData | null
  matchData: MatchData | null
  // status
  loading: boolean
  loadingMap: boolean
  loadingMatch: boolean
  error: string | null
  // filters / selection
  map: string
  date: string // 'all' or ISO date
  matchId: string | null // null => map overview
  playerFilter: string | null // highlight/isolate a single player
  // layers + heatmap
  layers: LayerToggles
  heatmap: HeatmapMode
  // playback
  playing: boolean
  speed: number
  currentTime: number // ms within match

  // actions
  init: () => Promise<void>
  loadMap: (map: string) => Promise<void>
  setDate: (d: string) => void
  selectMatch: (id: string) => Promise<void>
  clearMatch: () => void
  setPlayerFilter: (id: string | null) => void
  toggleLayer: (k: keyof LayerToggles) => void
  setHeatmap: (m: HeatmapMode) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  setTime: (t: number) => void
  restart: () => void
  applyPreset: (p: Preset) => void
}

export type Preset = 'traffic' | 'deaths' | 'kills' | 'loot'

export const useStore = create<AppState>((set, get) => ({
  manifest: null,
  mapData: null,
  matchData: null,
  loading: true,
  loadingMap: false,
  loadingMatch: false,
  error: null,
  map: 'AmbroseValley',
  date: 'all',
  matchId: null,
  playerFilter: null,
  layers: { humans: true, bots: true, events: true, movement: false, dimMap: true },
  heatmap: 'traffic',
  playing: false,
  speed: 1,
  currentTime: 0,

  init: async () => {
    try {
      const manifest = await fetchManifest()
      const url = readUrl()
      const mostPlayed = Object.entries(manifest.stats.byMap).sort((a, b) => b[1] - a[1])[0][0]
      const map = url.map && manifest.maps[url.map] ? url.map : mostPlayed
      const date = url.date && manifest.dates.includes(url.date) ? url.date : 'all'
      const heatmap = (['off', 'traffic', 'kills', 'deaths'] as HeatmapMode[]).includes(url.heatmap as HeatmapMode)
        ? (url.heatmap as HeatmapMode)
        : 'traffic'
      set({ manifest, map, date, heatmap, loading: false })
      if (url.matchId && manifest.matches.some((m) => m.id === url.matchId)) {
        await get().selectMatch(url.matchId)
      } else {
        await get().loadMap(map)
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  loadMap: async (map) => {
    set({ map, matchId: null, matchData: null, playerFilter: null, loadingMap: true, playing: false })
    try {
      const mapData = await fetchMapData(map)
      set({ mapData, loadingMap: false })
    } catch (e) {
      set({ error: (e as Error).message, loadingMap: false })
    }
  },

  setDate: (date) => set({ date }),

  selectMatch: async (id) => {
    const summary = get().manifest?.matches.find((m) => m.id === id)
    if (summary && summary.map !== get().map) await get().loadMap(summary.map)
    set({ matchId: id, loadingMatch: true, currentTime: 0, playing: false, playerFilter: null })
    try {
      const matchData = await fetchMatchData(id)
      set({ matchData, loadingMatch: false, currentTime: matchData.durationMs })
    } catch (e) {
      set({ error: (e as Error).message, loadingMatch: false })
    }
  },

  clearMatch: () => set({ matchId: null, matchData: null, playing: false, playerFilter: null }),

  setPlayerFilter: (id) => set({ playerFilter: id }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setHeatmap: (heatmap) => set({ heatmap }),
  setPlaying: (playing) => {
    // restart from 0 if pressing play at the end
    const s = get()
    if (playing && s.matchData && s.currentTime >= s.matchData.durationMs) set({ currentTime: 0 })
    set({ playing })
  },
  setSpeed: (speed) => set({ speed }),
  setTime: (currentTime) => set({ currentTime }),
  restart: () => set({ currentTime: 0, playing: true }),

  applyPreset: (p) => {
    const map = get().map
    if (p === 'traffic') set({ heatmap: 'traffic', layers: { ...get().layers, events: false, movement: false, dimMap: true } })
    if (p === 'deaths') set({ heatmap: 'deaths', layers: { ...get().layers, events: true, movement: false, dimMap: true } })
    if (p === 'kills') set({ heatmap: 'kills', layers: { ...get().layers, events: true, movement: false, dimMap: true } })
    if (p === 'loot') set({ heatmap: 'off', layers: { ...get().layers, events: true, movement: false, dimMap: true } })
    // presets operate on the current map overview
    if (get().matchId) get().clearMatch()
    void map
  },
}))
