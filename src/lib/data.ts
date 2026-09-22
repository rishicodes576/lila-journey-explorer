import type { Manifest, MapData, MatchData } from './types'

const BASE = import.meta.env.BASE_URL // './' by default (portable across hosts)
const url = (p: string) => `${BASE}data/${p}`

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(url(path))
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export const fetchManifest = () => getJSON<Manifest>('manifest.json')

// small in-memory caches so switching filters never re-downloads
const mapCache = new Map<string, Promise<MapData>>()
export function fetchMapData(map: string): Promise<MapData> {
  if (!mapCache.has(map)) mapCache.set(map, getJSON<MapData>(`maps/${map}.json`))
  return mapCache.get(map)!
}

const matchCache = new Map<string, Promise<MatchData>>()
export function fetchMatchData(id: string): Promise<MatchData> {
  if (!matchCache.has(id)) matchCache.set(id, getJSON<MatchData>(`matches/${id}.json`))
  return matchCache.get(id)!
}

export const minimapUrl = (image: string) => `${BASE}${image}`
