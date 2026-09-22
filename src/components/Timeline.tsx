import { useStore } from '../store'
import { fmtMatchTime, shortId } from '../lib/format'

const SPEEDS = [0.5, 1, 2, 4]

export default function Timeline() {
  const { matchId, matchData, playing, speed, currentTime, setPlaying, setSpeed, setTime, restart } = useStore()

  if (!matchId || !matchData) {
    return (
      <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
        <PlayGlyph />
        <span>Select a match in the sidebar to replay its timeline. The map view above shows aggregate patterns.</span>
      </div>
    )
  }

  const dur = matchData.durationMs || 1
  const progress = Math.min(1, currentTime / dur)
  const atEnd = currentTime >= dur

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-black hover:brightness-110"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseGlyph /> : <PlayGlyph filled />}
        </button>
        <button
          onClick={restart}
          className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:text-white"
          title="Restart"
        >
          ↺
        </button>

        <div className="flex flex-1 items-center gap-3">
          <input
            type="range"
            min={0}
            max={dur}
            step={Math.max(1, dur / 500)}
            value={currentTime}
            onChange={(e) => {
              setPlaying(false)
              setTime(Number(e.target.value))
            }}
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md bg-[var(--surface-2)] p-0.5">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                speed === sp ? 'bg-[var(--accent)] text-black' : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              {sp}×
            </button>
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span className="tabular-nums">
          match <span className="text-[var(--text-secondary)]">{shortId(matchData.id)}</span> ·{' '}
          {matchData.players.length} players
        </span>
        <span className="tabular-nums">
          {atEnd ? 'full match' : fmtMatchTime(currentTime)} / {fmtMatchTime(dur)} · {Math.round(progress * 100)}%
        </span>
      </div>
    </div>
  )
}

function PlayGlyph({ filled }: { filled?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M6 4l14 8-14 8V4z" strokeLinejoin="round" />
    </svg>
  )
}
function PauseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}
