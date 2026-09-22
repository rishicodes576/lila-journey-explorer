import { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { OrthographicView, type OrthographicViewState } from '@deck.gl/core'
import { BitmapLayer, ScatterplotLayer, IconLayer, PathLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { useStore } from '../store'
import { worldToLogical, logicalToWorld } from '../lib/coords'
import { buildIconAtlas } from '../lib/iconAtlas'
import { EVENT_STYLE, HUMAN_RGB, BOT_RGB, HEATMAP_RANGE } from '../lib/colors'
import { EVENT_BY_CODE, type MapMeta, type EventName } from '../lib/types'
import { minimapUrl } from '../lib/data'
import { fmtMatchTime } from '../lib/format'

const KILL_CODES = new Set([2, 4]) // Kill, BotKill
const DEATH_CODES = new Set([3, 5, 6]) // Killed, BotKilled, KilledByStorm

interface Halo {
  position: [number, number]
  kind: 'event' | 'head'
  name?: EventName
  color: [number, number, number]
  playerId?: string
  isBot?: boolean
  t?: number
  world?: [number, number]
}

export default function MapCanvas() {
  const { manifest, mapData, matchData, matchId, map, date, layers, heatmap, playerFilter, currentTime } =
    useStore()
  const meta: MapMeta | undefined = manifest?.maps[map]
  const L = manifest?.logicalSize ?? 1024

  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 800 })
  const icons = useMemo(() => buildIconAtlas(), [])

  // ---- fit-to-container view state (controlled, so "reset" works) ----
  const fitZoom = useMemo(() => Math.log2(Math.min(size.w, size.h) / L) - 0.05, [size, L])
  const [viewState, setViewState] = useState<OrthographicViewState>({ target: [L / 2, L / 2, 0], zoom: 0 })
  const touchedRef = useRef(false) // becomes true once the user pans/zooms
  const fitted = () => ({ target: [L / 2, L / 2, 0] as [number, number, number], zoom: fitZoom })
  const resetView = () => {
    touchedRef.current = false
    setViewState(fitted())
  }
  // keep the map fitted as the container resizes — until the user takes control
  useEffect(() => {
    if (!touchedRef.current && size.w > 0) setViewState(fitted())
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [fitZoom, size.w, size.h])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // re-fit when the map image changes
  useEffect(() => {
    resetView() /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [map])

  // ---- live world-coordinate read-out at the pointer ----
  const [hoverWorld, setHoverWorld] = useState<[number, number] | null>(null)
  const onPlaneMove = (e: React.MouseEvent) => {
    if (!meta) return
    const rect = wrapRef.current!.getBoundingClientRect()
    const scale = Math.pow(2, viewState.zoom as number)
    const tx = (viewState.target as number[])[0]
    const ty = (viewState.target as number[])[1]
    const lx = tx + (e.clientX - rect.left - size.w / 2) / scale
    const ly = ty - (e.clientY - rect.top - size.h / 2) / scale // flipY:false → screen-y down, world-y up
    setHoverWorld(logicalToWorld(lx, ly, meta))
  }

  // ---- allowed date codes for overview filtering ----
  const dateCodes = useMemo(() => {
    if (!mapData || date === 'all') return null
    const s = new Set<number>()
    mapData.dateIndex.forEach((d, i) => d === date && s.add(i))
    return s
  }, [mapData, date])

  // ---- OVERVIEW: project + filter positions and events from the per-map file ----
  const overview = useMemo(() => {
    if (matchId || !mapData || !meta) return null
    const positions: { position: [number, number]; bot: number }[] = []
    const events: Halo[] = []
    const P = mapData.pos
    for (let i = 0; i < P.x.length; i++) {
      if (dateCodes && !dateCodes.has(P.date[i])) continue
      if (P.bot[i] ? !layers.bots : !layers.humans) continue
      positions.push({ position: worldToLogical(P.x[i], P.z[i], meta), bot: P.bot[i] })
    }
    const E = mapData.ev
    for (let i = 0; i < E.x.length; i++) {
      if (dateCodes && !dateCodes.has(E.date[i])) continue
      if (E.bot[i] ? !layers.bots : !layers.humans) continue
      const name = EVENT_BY_CODE[E.type[i]] as EventName
      const style = EVENT_STYLE[name as keyof typeof EVENT_STYLE]
      if (!style) continue
      events.push({
        position: worldToLogical(E.x[i], E.z[i], meta),
        kind: 'event',
        name,
        color: style.rgb,
        isBot: !!E.bot[i],
        t: E.t[i],
        world: [E.x[i], E.z[i]],
      })
    }
    return { positions, events }
  }, [matchId, mapData, meta, dateCodes, layers.bots, layers.humans])

  // ---- MATCH: per-player paths, trips, markers ----
  const matchView = useMemo(() => {
    if (!matchId || !matchData || !meta) return null
    const players = matchData.players.filter((p) => {
      if (p.isBot ? !layers.bots : !layers.humans) return false
      if (playerFilter && p.id !== playerFilter) return false
      return true
    })
    const paths = players.map((p) => ({
      path: p.path.x.map((x, i) => worldToLogical(x, p.path.z[i], meta)),
      isBot: p.isBot,
      id: p.id,
    }))
    const trips = players
      .filter((p) => p.path.x.length > 1)
      .map((p) => ({
        path: p.path.x.map((x, i) => worldToLogical(x, p.path.z[i], meta)),
        timestamps: p.path.t,
        isBot: p.isBot,
        id: p.id,
      }))
    // current head position per player (last point with t <= currentTime)
    const heads: Halo[] = []
    for (const p of players) {
      if (!p.path.t.length) continue
      let idx = 0
      while (idx < p.path.t.length - 1 && p.path.t[idx + 1] <= currentTime) idx++
      heads.push({
        position: worldToLogical(p.path.x[idx], p.path.z[idx], meta),
        kind: 'head',
        color: p.isBot ? BOT_RGB : HUMAN_RGB,
        playerId: p.id,
        isBot: p.isBot,
      })
    }
    // markers revealed up to currentTime
    const events: Halo[] = []
    for (const p of players) {
      for (const mk of p.markers) {
        if (mk.t > currentTime) continue
        const name = EVENT_BY_CODE[mk.type] as EventName
        const style = EVENT_STYLE[name as keyof typeof EVENT_STYLE]
        if (!style) continue
        events.push({
          position: worldToLogical(mk.x, mk.z, meta),
          kind: 'event',
          name,
          color: style.rgb,
          playerId: p.id,
          isBot: p.isBot,
          t: mk.t,
          world: [mk.x, mk.z],
        })
      }
    }
    return { paths, trips, heads, events, duration: matchData.durationMs }
  }, [matchId, matchData, meta, layers.bots, layers.humans, playerFilter, currentTime])

  // ---- heatmap source points ----
  const heatPoints = useMemo(() => {
    if (heatmap === 'off' || !meta) return []
    const pts: { position: [number, number]; w: number }[] = []
    if (matchId && matchData) {
      for (const p of matchData.players) {
        if (heatmap === 'traffic') {
          for (let i = 0; i < p.path.x.length; i++)
            pts.push({ position: worldToLogical(p.path.x[i], p.path.z[i], meta), w: 1 })
        } else {
          for (const mk of p.markers) {
            const inKill = KILL_CODES.has(mk.type)
            const inDeath = DEATH_CODES.has(mk.type)
            if ((heatmap === 'kills' && inKill) || (heatmap === 'deaths' && inDeath))
              pts.push({ position: worldToLogical(mk.x, mk.z, meta), w: 1 })
          }
        }
      }
    } else if (mapData) {
      if (heatmap === 'traffic') {
        const P = mapData.pos
        for (let i = 0; i < P.x.length; i++) {
          if (dateCodes && !dateCodes.has(P.date[i])) continue
          pts.push({ position: worldToLogical(P.x[i], P.z[i], meta), w: 1 })
        }
      } else {
        const E = mapData.ev
        for (let i = 0; i < E.x.length; i++) {
          if (dateCodes && !dateCodes.has(E.date[i])) continue
          const inKill = KILL_CODES.has(E.type[i])
          const inDeath = DEATH_CODES.has(E.type[i])
          if ((heatmap === 'kills' && inKill) || (heatmap === 'deaths' && inDeath))
            pts.push({ position: worldToLogical(E.x[i], E.z[i], meta), w: 1 })
        }
      }
    }
    return pts
  }, [heatmap, meta, matchId, matchData, mapData, dateCodes])

  // ---------------------------------------------------------------- layers
  const deckLayers: any[] = []
  if (meta) {
    // basemap (dimmable for contrast)
    deckLayers.push(
      new BitmapLayer({
        id: `minimap-${map}`,
        image: minimapUrl(meta.image),
        bounds: [0, 0, L, L],
        opacity: layers.dimMap ? 0.55 : 1,
      }),
    )
  }

  // heatmap
  if (heatmap !== 'off' && heatPoints.length) {
    deckLayers.push(
      new HeatmapLayer({
        id: `heat-${heatmap}`,
        data: heatPoints,
        getPosition: (d: any) => d.position,
        getWeight: (d: any) => d.w,
        radiusPixels: heatmap === 'traffic' ? 26 : 40,
        intensity: 1,
        threshold: 0.04,
        colorRange: HEATMAP_RANGE[heatmap].map((c) => [c[0], c[1], c[2]]) as any,
        opacity: 0.85,
      }),
    )
  }

  // OVERVIEW layers
  if (overview) {
    if (layers.movement && overview.positions.length) {
      deckLayers.push(
        new ScatterplotLayer({
          id: 'overview-pos',
          data: overview.positions,
          getPosition: (d: any) => d.position,
          getFillColor: (d: any) => (d.bot ? [...BOT_RGB, 90] : [...HUMAN_RGB, 90]) as any,
          getRadius: 2,
          radiusUnits: 'pixels',
          radiusMinPixels: 1.2,
        }),
      )
    }
  }

  // MATCH layers
  if (matchView) {
    // faint full paths for context
    deckLayers.push(
      new PathLayer({
        id: 'match-paths',
        data: matchView.paths,
        getPath: (d: any) => d.path,
        getColor: (d: any) => (d.isBot ? [...BOT_RGB, 70] : [...HUMAN_RGB, 70]) as any,
        getWidth: 1.5,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      }),
    )
    // animated trip comet
    deckLayers.push(
      new TripsLayer({
        id: 'match-trips',
        data: matchView.trips,
        getPath: (d: any) => d.path,
        getTimestamps: (d: any) => d.timestamps,
        getColor: (d: any) => (d.isBot ? BOT_RGB : HUMAN_RGB) as any,
        widthUnits: 'pixels',
        getWidth: 3,
        opacity: 0.9,
        currentTime,
        trailLength: Math.max(60, matchView.duration * 0.35),
        capRounded: true,
        jointRounded: true,
      }),
    )
    // current head positions
    deckLayers.push(
      new ScatterplotLayer({
        id: 'match-heads',
        data: matchView.heads,
        pickable: true,
        getPosition: (d: any) => d.position,
        getFillColor: (d: any) => [...d.color, 255] as any,
        getLineColor: [13, 13, 13, 230],
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        stroked: true,
        getRadius: 6,
        radiusUnits: 'pixels',
        radiusMinPixels: 4,
      }),
    )
  }

  // event markers (overview or match) — tinted icons.
  // Match view is sparse → add a dark halo for contrast. Overview holds ~16k
  // events, so a per-marker halo would blot out the map: draw smaller,
  // slightly translucent icons that read as an event scatter instead.
  const markerData = matchView ? (layers.events ? matchView.events : []) : overview && layers.events ? overview.events : []
  if (markerData.length) {
    if (matchView) {
      deckLayers.push(
        new ScatterplotLayer({
          id: 'marker-halo',
          data: markerData,
          getPosition: (d: any) => d.position,
          getFillColor: [13, 13, 13, 200],
          getRadius: 9,
          radiusUnits: 'pixels',
          radiusMinPixels: 7,
        }),
      )
    }
    deckLayers.push(
      new IconLayer({
        id: 'marker-icons',
        data: markerData,
        pickable: true,
        iconAtlas: icons.atlas,
        iconMapping: icons.mapping as any,
        getIcon: (d: any) => EVENT_STYLE[d.name as keyof typeof EVENT_STYLE].icon,
        getPosition: (d: any) => d.position,
        getColor: (d: any) => [...d.color, matchView ? 255 : 210] as any,
        getSize: matchView ? 20 : 13,
        sizeUnits: 'pixels',
        sizeMinPixels: matchView ? 14 : 9,
      }),
    )
  }

  const getTooltip = ({ object }: any) => {
    if (!object) return null
    if (object.kind === 'event') {
      const style = EVENT_STYLE[object.name as keyof typeof EVENT_STYLE]
      const w = object.world ? `x ${object.world[0].toFixed(0)}, z ${object.world[1].toFixed(0)}` : ''
      return {
        html: `<div style="font:12px system-ui"><b style="color:rgb(${object.color.join(',')})">${style.label}</b><br/>${object.isBot ? 'bot' : 'human'} · ${object.playerId ? object.playerId.slice(0, 8) : ''}<br/>t ${fmtMatchTime(object.t)} · ${w}</div>`,
        style: { background: '#1a1a19', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px 8px' },
      }
    }
    if (object.kind === 'head') {
      return {
        html: `<div style="font:12px system-ui"><b>${object.isBot ? 'Bot' : 'Player'}</b> ${object.playerId?.slice(0, 8)}</div>`,
        style: { background: '#1a1a19', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px 8px' },
      }
    }
    return null
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full" onMouseMove={onPlaneMove} onMouseLeave={() => setHoverWorld(null)}>
      <DeckGL
        views={new OrthographicView({ id: 'ortho', flipY: false })}
        viewState={viewState}
        controller={{ scrollZoom: { speed: 0.02, smooth: true } }}
        onViewStateChange={(e: any) => {
          setViewState(e.viewState)
          const is = e.interactionState
          if (is && (is.isDragging || is.isZooming || is.isPanning)) touchedRef.current = true
        }}
        layers={deckLayers}
        getTooltip={getTooltip}
        style={{ background: '#0d0d0d' }}
      />
      <button
        onClick={resetView}
        className="absolute right-3 top-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-1)]/90 px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-white"
      >
        Reset view
      </button>
      {hoverWorld && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface-1)]/90 px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">
          x {hoverWorld[0].toFixed(0)} · z {hoverWorld[1].toFixed(0)}
        </div>
      )}
    </div>
  )
}
