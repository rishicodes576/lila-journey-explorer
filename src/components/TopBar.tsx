import { useStore } from '../store'
import { num } from '../lib/format'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-sm font-semibold tabular-nums text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

export default function TopBar() {
  const manifest = useStore((s) => s.manifest)
  const s = manifest?.stats
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[#38bdf8] to-[#3987e5] text-xs font-black text-black">
          LB
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-white">LILA BLACK — Player Journey Explorer</h1>
          <p className="text-[11px] text-[var(--text-muted)]">Movement · combat · loot · storm across 3 maps</p>
        </div>
      </div>
      {s && (
        <div className="hidden items-center gap-6 md:flex">
          <Stat label="Matches" value={num(s.matches)} />
          <Stat label="Players" value={`${num(s.humans)} + ${num(s.bots)} bots`} />
          <Stat label="Events" value={num(s.totalRows)} />
          <Stat label="Days" value={`${manifest.dates.length} (Feb 10–14)`} />
        </div>
      )}
    </header>
  )
}
