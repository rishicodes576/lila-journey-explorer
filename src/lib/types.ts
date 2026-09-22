// Shared types describing the preprocessed artifacts (see scripts/preprocess.mjs).

export type EventName =
  | 'Position'
  | 'BotPosition'
  | 'Kill'
  | 'Killed'
  | 'BotKill'
  | 'BotKilled'
  | 'KilledByStorm'
  | 'Loot'

/** integer code -> event name; matches EVENT_CODES in the pipeline */
export const EVENT_BY_CODE: EventName[] = [
  'Position',
  'BotPosition',
  'Kill',
  'Killed',
  'BotKill',
  'BotKilled',
  'KilledByStorm',
  'Loot',
]

export interface MapMeta {
  scale: number
  originX: number
  originZ: number
  logicalSize: number
  image: string
  imgW: number
  imgH: number
}

export interface MatchSummary {
  id: string
  map: string
  date: string
  nHumans: number
  nBots: number
  nEvents: number
  durationMs: number
  ec: Partial<Record<EventName, number>>
}

export interface PlayerSummary {
  id: string
  isBot: boolean
  matches: string[]
  nMatches: number
}

export interface Manifest {
  generatedAt: string
  maps: Record<string, MapMeta>
  logicalSize: number
  eventTypes: Record<EventName, number>
  dates: string[]
  stats: {
    totalFiles: number
    totalRows: number
    failedFiles: number
    players: number
    humans: number
    bots: number
    matches: number
    eventCounts: Partial<Record<EventName, number>>
    byMap: Record<string, number>
    byDate: Record<string, number>
  }
  matches: MatchSummary[]
  players: PlayerSummary[]
}

/** Columnar per-map file: all discrete events + all position samples. */
export interface MapData {
  map: string
  matchIndex: string[]
  dateIndex: string[]
  ev: {
    x: number[]
    z: number[]
    t: number[]
    type: number[]
    match: number[]
    date: number[]
    bot: number[]
  }
  pos: {
    x: number[]
    z: number[]
    match: number[]
    date: number[]
    bot: number[]
  }
}

export interface Marker {
  x: number
  z: number
  t: number
  type: number
}
export interface PlayerJourney {
  id: string
  isBot: boolean
  path: { x: number[]; z: number[]; t: number[] }
  markers: Marker[]
}
export interface MatchData {
  id: string
  map: string
  date: string
  durationMs: number
  players: PlayerJourney[]
}

export type HeatmapMode = 'off' | 'traffic' | 'kills' | 'deaths'
