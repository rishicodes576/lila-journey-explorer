/**
 * LILA BLACK — Telemetry preprocessing pipeline
 * ----------------------------------------------
 * Reads the raw Apache Parquet event files (one player-journey per file) and
 * transforms them into compact, web-ready static artifacts that a pure static
 * SPA can consume with zero backend:
 *
 *   public/data/manifest.json        global index (maps, matches, players, stats)
 *   public/data/maps/<map>.json      all events for a map (columnar) -> heatmaps + overview
 *   public/data/matches/<id>.json    full per-player journeys        -> playback + detail
 *   public/data/analysis.json        precomputed insight metrics (seeds INSIGHTS.md)
 *   public/minimaps/<map>.webp       downscaled, web-optimised minimap images
 *
 * Run:  npm run preprocess
 */
import { parquetReadObjects, asyncBufferFromFile } from 'hyparquet'
import sharp from 'sharp'
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DATA_DIR = resolve('C:/Users/risha/Downloads/player_data/player_data')
const OUT_DATA = resolve('public/data')
const OUT_MAPS = resolve('public/minimaps')

// Per-map coordinate system (from README). UV mapping is resolution-independent;
// we render everything in a fixed 1024-unit logical space to match the README's math.
const MAP_CONFIG = {
  AmbroseValley: { scale: 900, originX: -370, originZ: -473, src: 'AmbroseValley_Minimap.png' },
  GrandRift:     { scale: 581, originX: -290, originZ: -290, src: 'GrandRift_Minimap.png' },
  Lockdown:      { scale: 1000, originX: -500, originZ: -500, src: 'Lockdown_Minimap.jpg' },
}
const LOGICAL = 1024        // logical coordinate space (matches README pixel example)
const WEB_IMG_MAX = 2048    // downscale minimaps to this many px on the long edge
const GRID = 32             // heatmap/hotspot grid resolution (32x32 cells over 1024)

// Event type -> small integer code (keeps map files tiny)
const EVENT_CODES = {
  Position: 0, BotPosition: 1, Kill: 2, Killed: 3,
  BotKill: 4, BotKilled: 5, KilledByStorm: 6, Loot: 7,
}
const DISCRETE = new Set(['Kill', 'Killed', 'BotKill', 'BotKilled', 'KilledByStorm', 'Loot'])
const POSITION = new Set(['Position', 'BotPosition'])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const round1 = (n) => Math.round(n * 10) / 10
const isBotId = (uid) => /^\d+$/.test(String(uid))
const folderToDate = (f) => {
  const day = f.split('_')[1]
  return `2026-02-${String(day).padStart(2, '0')}`
}
const tsMs = (ts) => (ts instanceof Date ? ts.getTime() : Number(ts))
const stripSuffix = (matchId) => matchId.replace(/\.nakama-\d+$/, '')

/** world (x,z) -> logical pixel (0..1024). Single source of truth, mirrored in src/lib/coords.ts */
function worldToLogical(x, z, cfg) {
  const u = (x - cfg.originX) / cfg.scale
  const v = (z - cfg.originZ) / cfg.scale
  return [u * LOGICAL, (1 - v) * LOGICAL]
}

// ---------------------------------------------------------------------------
// Load every parquet file, grouped by match
// ---------------------------------------------------------------------------
async function loadAll() {
  const dayFolders = (await readdir(DATA_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name.startsWith('February_'))
    .map((d) => d.name)
    .sort()

  const matches = new Map() // matchId(base) -> { id, map, date, players: Map(uid -> journey) }
  let totalRows = 0, totalFiles = 0, failed = 0

  for (const folder of dayFolders) {
    const date = folderToDate(folder)
    const files = await readdir(join(DATA_DIR, folder))
    process.stdout.write(`  ${folder}: ${files.length} files … `)

    // read in parallel batches for speed
    const BATCH = 64
    for (let i = 0; i < files.length; i += BATCH) {
      const slice = files.slice(i, i + BATCH)
      const results = await Promise.all(slice.map(async (fname) => {
        try {
          const file = await asyncBufferFromFile(join(DATA_DIR, folder, fname))
          const rows = await parquetReadObjects({ file })
          return { fname, rows }
        } catch (e) {
          return { fname, err: e }
        }
      }))

      for (const { rows, err } of results) {
        totalFiles++
        if (err || !rows || !rows.length) { failed++; continue }
        totalRows += rows.length

        const first = rows[0]
        const uid = String(first.user_id)
        const matchId = stripSuffix(String(first.match_id))
        const map = String(first.map_id)
        const bot = isBotId(uid)

        if (!matches.has(matchId)) matches.set(matchId, { id: matchId, map, date, players: new Map() })
        const match = matches.get(matchId)
        // (a match spans multiple days folders? no — but be safe, keep earliest date)
        if (date < match.date) match.date = date

        // build this player's journey
        const evs = []
        for (const r of rows) {
          const t = tsMs(r.ts)
          const type = String(r.event)
          evs.push({ x: r.x, z: r.z, y: r.y, t, type })
        }
        // A (match, player) can span multiple files — merge, don't overwrite.
        const existing = match.players.get(uid)
        if (existing) existing.evs.push(...evs)
        else match.players.set(uid, { id: uid, bot, evs })
      }
    }
    process.stdout.write(`ok\n`)
  }
  return { matches, totalRows, totalFiles, failed }
}

// ---------------------------------------------------------------------------
// Build artifacts
// ---------------------------------------------------------------------------
async function build() {
  console.log('Reading parquet files from', DATA_DIR)
  const { matches, totalRows, totalFiles, failed } = await loadAll()
  console.log(`Parsed ${totalFiles} files (${failed} failed), ${totalRows} rows, ${matches.size} matches`)

  await mkdir(join(OUT_DATA, 'matches'), { recursive: true })
  await mkdir(join(OUT_DATA, 'maps'), { recursive: true })
  await mkdir(OUT_MAPS, { recursive: true })

  // per-map columnar accumulators
  const mapAccum = {} // map -> { ev:{...}, pos:{...}, matchIndex:[], matchCode:Map, dateIndex:[], dateCode:Map }
  const ensureMap = (m) => {
    if (!mapAccum[m]) mapAccum[m] = {
      ev: { x: [], z: [], t: [], type: [], match: [], date: [], bot: [] },
      pos: { x: [], z: [], match: [], date: [], bot: [] },
      matchIndex: [], matchCode: new Map(), dateIndex: [], dateCode: new Map(),
    }
    return mapAccum[m]
  }
  const codeOf = (arr, map, key) => {
    if (!map.has(key)) { map.set(key, arr.length); arr.push(key) }
    return map.get(key)
  }

  // insight accumulators
  const players = new Map() // uid -> { id, isBot, matches:Set }
  const durations = {}      // map -> [durMs]
  const grids = {}          // map -> { kills, deaths, storm, loot, traffic } each Int32Array(GRID*GRID)
  const ensureGrid = (m) => {
    if (!grids[m]) grids[m] = {
      kills: new Int32Array(GRID * GRID), deaths: new Int32Array(GRID * GRID),
      storm: new Int32Array(GRID * GRID), loot: new Int32Array(GRID * GRID),
      traffic: new Int32Array(GRID * GRID),
    }
    return grids[m]
  }
  const cellIdx = (x, z, cfg) => {
    const [px, py] = worldToLogical(x, z, cfg)
    let cx = Math.floor((px / LOGICAL) * GRID)
    let cy = Math.floor((py / LOGICAL) * GRID)
    cx = Math.max(0, Math.min(GRID - 1, cx))
    cy = Math.max(0, Math.min(GRID - 1, cy))
    return cy * GRID + cx
  }

  const manifestMatches = []
  const globalEC = {} // event -> count
  const byDate = {}
  const byMap = {}

  // sort matches for stable output (by date then id)
  const sortedMatches = [...matches.values()].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date))

  for (const match of sortedMatches) {
    const cfg = MAP_CONFIG[match.map]
    if (!cfg) { console.warn('unknown map', match.map); continue }
    const g = ensureGrid(match.map)
    const acc = ensureMap(match.map)
    const dCode = codeOf(acc.dateIndex, acc.dateCode, match.date)

    // match-wide min ts for normalisation, plus max for duration
    let minTs = Infinity, maxTs = -Infinity
    for (const p of match.players.values())
      for (const e of p.evs) { if (e.t < minTs) minTs = e.t; if (e.t > maxTs) maxTs = e.t }
    const durationMs = (maxTs - minTs) || 0

    let nHumans = 0, nBots = 0, nEvents = 0
    const ec = {}
    const matchPlayers = []

    for (const p of match.players.values()) {
      p.evs.sort((a, b) => a.t - b.t) // sort once here (evs may be merged from multiple files)
      p.bot ? nBots++ : nHumans++
      // register player
      if (!players.has(p.id)) players.set(p.id, { id: p.id, isBot: p.bot, matches: new Set() })
      players.get(p.id).matches.add(match.id)

      const path = { x: [], z: [], t: [] }
      const markers = []
      const mCode = codeOf(acc.matchIndex, acc.matchCode, match.id)

      for (const e of p.evs) {
        nEvents++
        ec[e.type] = (ec[e.type] || 0) + 1
        globalEC[e.type] = (globalEC[e.type] || 0) + 1
        const t = e.t - minTs
        const x = round1(e.x), z = round1(e.z)

        if (POSITION.has(e.type)) {
          path.x.push(x); path.z.push(z); path.t.push(t)
          // per-map position (for traffic heatmap + overview)
          acc.pos.x.push(x); acc.pos.z.push(z)
          acc.pos.match.push(mCode); acc.pos.date.push(dCode); acc.pos.bot.push(p.bot ? 1 : 0)
          g.traffic[cellIdx(e.x, e.z, cfg)]++
        } else {
          markers.push({ x, z, t, type: EVENT_CODES[e.type] ?? -1 })
          acc.ev.x.push(x); acc.ev.z.push(z); acc.ev.t.push(t)
          acc.ev.type.push(EVENT_CODES[e.type] ?? -1)
          acc.ev.match.push(mCode); acc.ev.date.push(dCode); acc.ev.bot.push(p.bot ? 1 : 0)
          // insight grids
          const ci = cellIdx(e.x, e.z, cfg)
          if (e.type === 'Kill' || e.type === 'BotKill') g.kills[ci]++
          if (e.type === 'Killed' || e.type === 'BotKilled') g.deaths[ci]++
          if (e.type === 'KilledByStorm') { g.storm[ci]++; g.deaths[ci]++ }
          if (e.type === 'Loot') g.loot[ci]++
        }
      }
      matchPlayers.push({ id: p.id, isBot: p.bot, path, markers })
    }

    // write per-match file
    await writeFile(
      join(OUT_DATA, 'matches', `${match.id}.json`),
      JSON.stringify({ id: match.id, map: match.map, date: match.date, durationMs, players: matchPlayers })
    )

    manifestMatches.push({
      id: match.id, map: match.map, date: match.date,
      nHumans, nBots, nEvents, durationMs, ec,
    })
    byDate[match.date] = (byDate[match.date] || 0) + 1
    byMap[match.map] = (byMap[match.map] || 0) + 1
    ;(durations[match.map] ||= []).push(durationMs)
  }

  // write per-map files
  for (const [m, acc] of Object.entries(mapAccum)) {
    await writeFile(join(OUT_DATA, 'maps', `${m}.json`), JSON.stringify({
      map: m,
      matchIndex: acc.matchIndex,
      dateIndex: acc.dateIndex,
      ev: acc.ev,
      pos: acc.pos,
    }))
  }

  // ------- minimap image optimisation -------
  const mapsMeta = {}
  for (const [m, cfg] of Object.entries(MAP_CONFIG)) {
    const inPath = join(DATA_DIR, 'minimaps', cfg.src)
    const outName = `${m}.webp`
    const img = sharp(inPath).resize(WEB_IMG_MAX, WEB_IMG_MAX, { fit: 'inside', withoutEnlargement: true })
    const info = await img.webp({ quality: 82 }).toFile(join(OUT_MAPS, outName))
    mapsMeta[m] = {
      scale: cfg.scale, originX: cfg.originX, originZ: cfg.originZ,
      logicalSize: LOGICAL, image: `minimaps/${outName}`, imgW: info.width, imgH: info.height,
    }
    console.log(`  minimap ${m}: ${info.width}x${info.height} webp ${(info.size / 1024).toFixed(0)}KB`)
  }

  // ------- players list -------
  const playerList = [...players.values()]
    .map((p) => ({ id: p.id, isBot: p.isBot, matches: [...p.matches], nMatches: p.matches.size }))
    .sort((a, b) => b.nMatches - a.nMatches)

  // ------- manifest -------
  const dates = Object.keys(byDate).sort()
  const manifest = {
    generatedAt: new Date().toISOString(),
    maps: mapsMeta,
    logicalSize: LOGICAL,
    eventTypes: EVENT_CODES,
    dates,
    stats: {
      totalFiles, totalRows, failedFiles: failed,
      players: playerList.length,
      humans: playerList.filter((p) => !p.isBot).length,
      bots: playerList.filter((p) => p.isBot).length,
      matches: manifestMatches.length,
      eventCounts: globalEC,
      byMap, byDate,
    },
    matches: manifestMatches,
    players: playerList,
  }
  await writeFile(join(OUT_DATA, 'manifest.json'), JSON.stringify(manifest))

  // ------- analysis.json (insight metrics) -------
  await writeFile(join(OUT_DATA, 'analysis.json'), JSON.stringify(buildAnalysis({
    manifest, durations, grids, playerList, globalEC,
  }), null, 2))

  // ------- report -------
  const sizeOf = async (p) => (await stat(p)).size
  const manSize = await sizeOf(join(OUT_DATA, 'manifest.json'))
  console.log('\nArtifacts written:')
  console.log(`  manifest.json         ${(manSize / 1024).toFixed(0)} KB`)
  for (const m of Object.keys(mapAccum)) {
    const s = await sizeOf(join(OUT_DATA, 'maps', `${m}.json`))
    console.log(`  maps/${m}.json  ${(s / 1024).toFixed(0)} KB  (${mapAccum[m].pos.x.length} pos, ${mapAccum[m].ev.x.length} events)`)
  }
  // duration sanity
  for (const [m, arr] of Object.entries(durations)) {
    const s = arr.slice().sort((a, b) => a - b)
    const med = s[Math.floor(s.length / 2)]
    console.log(`  duration ${m}: n=${arr.length} median=${(med / 1000).toFixed(1)}s max=${(Math.max(...arr) / 1000).toFixed(1)}s`)
  }
  console.log('\nDone.')
}

function topCells(grid, cfg, n = 12) {
  const cells = []
  for (let i = 0; i < grid.length; i++) if (grid[i] > 0) {
    const cx = i % GRID, cy = Math.floor(i / GRID)
    // cell centre in logical px -> back to world for readability
    const px = (cx + 0.5) / GRID * LOGICAL, py = (cy + 0.5) / GRID * LOGICAL
    const u = px / LOGICAL, v = 1 - py / LOGICAL
    const x = round1(u * cfg.scale + cfg.originX), z = round1(v * cfg.scale + cfg.originZ)
    cells.push({ cx, cy, x, z, count: grid[i] })
  }
  cells.sort((a, b) => b.count - a.count)
  return cells.slice(0, n)
}

function buildAnalysis({ manifest, durations, grids, playerList, globalEC }) {
  const s = manifest.stats
  // map popularity
  const mapPopularity = Object.entries(s.byMap)
    .map(([map, matches]) => ({ map, matches, share: +(matches / s.matches).toFixed(3) }))
    .sort((a, b) => b.matches - a.matches)

  // human death breakdown
  const pvp = (globalEC.Killed || 0)          // human killed by human
  const byBot = (globalEC.BotKilled || 0)     // human killed by bot
  const byStorm = (globalEC.KilledByStorm || 0)
  const totalHumanDeaths = pvp + byBot + byStorm
  const deathBreakdown = {
    total: totalHumanDeaths,
    byPlayers: pvp, byBots: byBot, byStorm,
    pctPlayers: pct(pvp, totalHumanDeaths),
    pctBots: pct(byBot, totalHumanDeaths),
    pctStorm: pct(byStorm, totalHumanDeaths),
  }

  const avgDuration = {}
  for (const [m, arr] of Object.entries(durations)) {
    const sum = arr.reduce((a, b) => a + b, 0)
    avgDuration[m] = { avgMs: Math.round(sum / arr.length), n: arr.length }
  }

  // hotspots + dead-zone coverage per map
  const hotspots = {}, coverage = {}
  for (const [m, g] of Object.entries(grids)) {
    const cfg = MAP_CONFIG[m]
    hotspots[m] = {
      kills: topCells(g.kills, cfg), deaths: topCells(g.deaths, cfg),
      storm: topCells(g.storm, cfg), loot: topCells(g.loot, cfg),
    }
    let visited = 0
    for (let i = 0; i < g.traffic.length; i++) if (g.traffic[i] > 0) visited++
    coverage[m] = {
      cells: GRID * GRID, visitedCells: visited,
      coveragePct: pct(visited, GRID * GRID),
      deadCells: GRID * GRID - visited,
    }
  }

  return {
    generatedAt: manifest.generatedAt,
    overview: {
      totalFiles: s.totalFiles, totalRows: s.totalRows,
      players: s.players, humans: s.humans, bots: s.bots,
      matches: s.matches, dateRange: manifest.dates,
      eventCounts: globalEC,
    },
    mapPopularity,
    avgDuration,
    deathBreakdown,
    hotspots,
    coverage,
    gridResolution: GRID,
  }
}
const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : 0)

build().catch((e) => { console.error(e); process.exit(1) })
