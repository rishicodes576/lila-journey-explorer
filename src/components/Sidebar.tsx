import { useMemo } from 'react'
import { useStore, type Preset } from '../store'
import { EVENT_STYLE, rgbaCss, HUMAN_HEX, BOT_HEX } from '../lib/colors'
import { num, fmtDate, fmtMatchTime, shortId } from '../lib/format'
import type { HeatmapMode, MatchSummary, EventName } from '../lib/types'

// ---- small building blocks -------------------------------------------------
function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  )
}

function Seg<T extends string>({ options, value, onChange }: { options: { v: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2 py-1.5 text-left text-xs transition ${
            value === o.v ? 'bg-[var(--accent)] text-black' : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <div className="font-medium">{o.label}</div>
          {o.sub && <div className={`text-[10px] ${value === o.v ? 'text-black/60' : 'text-[var(--text-muted)]'}`}>{o.sub}</div>}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, checked, onChange, dot }: { label: string; checked: boolean; onChange: () => void; dot?: string }) {
  return (
    <button onClick={onChange} className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs hover:bg-[var(--surface-2)]">
      <span className="flex items-center gap-2 text-[var(--text-secondary)]">
        {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}
        {label}
      </span>
      <span className={`relative h-4 w-7 rounded-full transition ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)]'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

// ---- main ------------------------------------------------------------------
export default function Sidebar() {
  const s = useStore()
  const { manifest, map, date, matchId, matchData, playerFilter, layers, heatmap } = s

  // matches for the current map (+date), best-populated first
  const matchList = useMemo(() => {
    if (!manifest) return []
    return manifest.matches
      .filter((m) => m.map === map && (date === 'all' || m.date === date))
      .sort((a, b) => b.nHumans + b.nBots - (a.nHumans + a.nBots) || b.nEvents - a.nEvents)
  }, [manifest, map, date])

  // aggregate event breakdown for the current selection
  const breakdown = useMemo(() => {
    const acc: Partial<Record<EventName, number>> = {}
    if (!manifest) return acc
    const src = matchId ? manifest.matches.filter((m) => m.id === matchId) : matchList
    for (const m of src) for (const k in m.ec) acc[k as EventName] = (acc[k as EventName] || 0) + (m.ec[k as EventName] || 0)
    return acc
  }, [matchId, matchList, manifest])

  if (!manifest) return <aside className="w-80 shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)]" />

  const mapOpts = Object.keys(manifest.maps).map((m) => ({ v: m, label: m.replace(/([A-Z])/g, ' $1').trim(), sub: `${num(manifest.stats.byMap[m] || 0)} matches` }))

  return (
    <aside className="scroll-thin w-80 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-1)]">
      <Section title="Map">
        <Seg options={mapOpts} value={map} onChange={(m) => s.loadMap(m)} />
      </Section>

      <Section title="Quick views">
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              ['traffic', 'Traffic', 'movement density'],
              ['deaths', 'Danger', 'death zones'],
              ['kills', 'Kills', 'kill hotspots'],
              ['loot', 'Loot', 'item pickups'],
            ] as [Preset, string, string][]
          ).map(([p, label, sub]) => (
            <button
              key={p}
              onClick={() => s.applyPreset(p)}
              className="rounded-md bg-[var(--surface-2)] px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:text-white"
            >
              <div className="font-medium">{label}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Date">
        <div className="flex flex-wrap gap-1">
          <Pill active={date === 'all'} onClick={() => s.setDate('all')}>All</Pill>
          {manifest.dates.map((d) => (
            <Pill key={d} active={date === d} onClick={() => s.setDate(d)}>
              {fmtDate(d)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section title="Heatmap">
        <Seg<HeatmapMode>
          options={[
            { v: 'off', label: 'Off' },
            { v: 'traffic', label: 'Traffic' },
            { v: 'kills', label: 'Kills' },
            { v: 'deaths', label: 'Deaths' },
          ]}
          value={heatmap}
          onChange={s.setHeatmap}
        />
      </Section>

      <Section title="Layers">
        <div className="space-y-0.5">
          <Toggle label="Humans" checked={layers.humans} onChange={() => s.toggleLayer('humans')} dot={HUMAN_HEX} />
          <Toggle label="Bots" checked={layers.bots} onChange={() => s.toggleLayer('bots')} dot={BOT_HEX} />
          <Toggle label="Event markers" checked={layers.events} onChange={() => s.toggleLayer('events')} />
          <Toggle label="Movement dots" checked={layers.movement} onChange={() => s.toggleLayer('movement')} />
          <Toggle label="Dim basemap" checked={layers.dimMap} onChange={() => s.toggleLayer('dimMap')} />
        </div>
      </Section>

      <Section
        title={matchId ? 'Match' : `Matches · ${matchList.length}`}
        right={
          matchId ? (
            <button onClick={s.clearMatch} className="text-[11px] text-[var(--accent)] hover:underline">
              ← Overview
            </button>
          ) : undefined
        }
      >
        {matchId && matchData ? (
          <MatchDetail />
        ) : (
          <div className="scroll-thin max-h-64 space-y-1 overflow-y-auto pr-1">
            {matchList.slice(0, 80).map((m) => (
              <MatchRow key={m.id} m={m} onClick={() => s.selectMatch(m.id)} />
            ))}
            {matchList.length > 80 && (
              <div className="px-1 pt-1 text-[10px] text-[var(--text-muted)]">showing top 80 of {matchList.length} (best-populated first)</div>
            )}
            {matchList.length === 0 && <div className="px-1 text-xs text-[var(--text-muted)]">No matches for this filter.</div>}
          </div>
        )}
      </Section>

      <Section title={matchId ? 'Event breakdown · this match' : 'Event breakdown · selection'}>
        <Breakdown data={breakdown} />
      </Section>

      <div className="px-4 py-3 text-[10px] text-[var(--text-muted)]">
        {playerFilter && (
          <button onClick={() => s.setPlayerFilter(null)} className="mb-1 block text-[var(--accent)] hover:underline">
            ← show all players
          </button>
        )}
        Data: {num(manifest.stats.totalFiles)} files · generated {new Date(manifest.generatedAt).toLocaleDateString()}
      </div>
    </aside>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] ${active ? 'bg-[var(--accent)] text-black' : 'bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function MatchRow({ m, onClick }: { m: MatchSummary; onClick: () => void }) {
  const combat = (m.ec.BotKill || 0) + (m.ec.Kill || 0) + (m.ec.BotKilled || 0) + (m.ec.Killed || 0) + (m.ec.KilledByStorm || 0)
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-md bg-[var(--surface-2)]/60 px-2 py-1.5 text-left hover:bg-[var(--surface-2)]">
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-[var(--text-secondary)]">{shortId(m.id)}</div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {fmtDate(m.date)} · {m.nHumans}H {m.nBots}B
        </div>
      </div>
      <div className="text-right text-[10px] text-[var(--text-muted)]">
        <div className="tabular-nums text-[var(--text-secondary)]">{num(m.nEvents)} ev</div>
        <div>{combat} combat</div>
      </div>
    </button>
  )
}

function MatchDetail() {
  const { matchData, playerFilter, setPlayerFilter } = useStore()
  if (!matchData) return null
  const players = [...matchData.players].sort((a, b) => Number(a.isBot) - Number(b.isBot) || b.markers.length - a.markers.length)
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
        <span>{fmtDate(matchData.date)}</span>
        <span>·</span>
        <span>{matchData.players.length} players</span>
        <span>·</span>
        <span>{fmtMatchTime(matchData.durationMs)}</span>
      </div>
      <div className="scroll-thin max-h-56 space-y-0.5 overflow-y-auto pr-1">
        <button
          onClick={() => setPlayerFilter(null)}
          className={`w-full rounded px-2 py-1 text-left text-[11px] ${!playerFilter ? 'bg-[var(--surface-2)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'}`}
        >
          All players
        </button>
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlayerFilter(playerFilter === p.id ? null : p.id)}
            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] ${
              playerFilter === p.id ? 'bg-[var(--surface-2)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: p.isBot ? BOT_HEX : HUMAN_HEX }} />
              <span className="font-mono">{p.isBot ? `bot ${p.id}` : shortId(p.id)}</span>
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{p.markers.length} ev</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const BD_ORDER: EventName[] = ['Loot', 'BotKill', 'BotKilled', 'Kill', 'Killed', 'KilledByStorm']

function Breakdown({ data }: { data: Partial<Record<EventName, number>> }) {
  const rows = BD_ORDER.filter((k) => (data[k] || 0) > 0)
  const posTotal = (data.Position || 0) + (data.BotPosition || 0)
  if (!rows.length && !posTotal) return <div className="text-xs text-[var(--text-muted)]">No events.</div>
  return (
    <div className="space-y-1">
      {rows.map((k) => {
        const st = EVENT_STYLE[k as keyof typeof EVENT_STYLE]
        return (
          <div key={k} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-sm" style={{ background: rgbaCss(st.rgb) }} />
              {st.label}
            </span>
            <span className="tabular-nums text-white">{num(data[k] || 0)}</span>
          </div>
        )
      })}
      {posTotal > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-1 text-[11px]">
          <span className="text-[var(--text-muted)]">Position samples</span>
          <span className="tabular-nums text-[var(--text-secondary)]">{num(posTotal)}</span>
        </div>
      )}
    </div>
  )
}
