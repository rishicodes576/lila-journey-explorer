import { useState } from 'react'
import { useStore } from '../store'
import { EVENT_STYLE, HUMAN_HEX, BOT_HEX, HEATMAP_RANGE, rgbaCss, type IconShape } from '../lib/colors'
import type { HeatmapMode } from '../lib/types'

const ORDER: (keyof typeof EVENT_STYLE)[] = ['BotKill', 'Kill', 'BotKilled', 'Killed', 'KilledByStorm', 'Loot']

function ShapeSwatch({ shape, color }: { shape: IconShape; color: string }) {
  const c = 20,
    r = 7
  const common = { fill: color, stroke: '#0d0d0d', strokeWidth: 1 }
  let el: React.ReactNode
  switch (shape) {
    case 'triUp':
      el = <polygon points={`${c},${c - r} ${c + r},${c + r * 0.8} ${c - r},${c + r * 0.8}`} {...common} />
      break
    case 'triDown':
      el = <polygon points={`${c},${c + r} ${c + r},${c - r * 0.8} ${c - r},${c - r * 0.8}`} {...common} />
      break
    case 'diamond':
      el = <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} {...common} />
      break
    case 'hex': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2
        return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`
      }).join(' ')
      el = <polygon points={pts} {...common} />
      break
    }
    case 'cross':
      el = (
        <g transform={`rotate(45 ${c} ${c})`}>
          <rect x={c - 1.5} y={c - r} width={3} height={r * 2} {...common} />
          <rect x={c - r} y={c - 1.5} width={r * 2} height={3} {...common} />
        </g>
      )
      break
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const rad = i % 2 === 0 ? r : r * 0.45
        const a = (Math.PI / 5) * i - Math.PI / 2
        return `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`
      }).join(' ')
      el = <polygon points={pts} {...common} />
      break
    }
  }
  return (
    <svg width="20" height="20" viewBox="0 0 40 40">
      <circle cx={c} cy={c} r={9.5} fill="rgba(13,13,13,0.7)" />
      {el}
    </svg>
  )
}

const HEAT_LABEL: Record<Exclude<HeatmapMode, 'off'>, string> = {
  traffic: 'Movement density',
  kills: 'Kill hotspots',
  deaths: 'Death / danger zones',
}

export default function Legend() {
  const heatmap = useStore((s) => s.heatmap)
  const layers = useStore((s) => s.layers)
  const [open, setOpen] = useState(true)

  return (
    <div className="absolute left-3 top-3 z-10 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface-1)]/92 backdrop-blur">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
      >
        Legend
        <span className="text-[var(--text-muted)]">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          {layers.events && (
            <div className="space-y-1">
              {ORDER.map((k) => {
                const st = EVENT_STYLE[k]
                return (
                  <div key={k} className="flex items-center gap-2">
                    <ShapeSwatch shape={st.icon} color={rgbaCss(st.rgb)} />
                    <span className="text-[11px] text-[var(--text-secondary)]">{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-1.5 border-t border-[var(--border)] pt-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Tracks</div>
            <div className="flex items-center gap-2">
              <span className="h-[3px] w-6 rounded-full" style={{ background: HUMAN_HEX }} />
              <span className="text-[11px] text-[var(--text-secondary)]">Human</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-[3px] w-6 rounded-full" style={{ background: BOT_HEX }} />
              <span className="text-[11px] text-[var(--text-secondary)]">Bot</span>
            </div>
          </div>

          {heatmap !== 'off' && (
            <div className="space-y-1 border-t border-[var(--border)] pt-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{HEAT_LABEL[heatmap]}</div>
              <div
                className="h-2 w-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${HEATMAP_RANGE[heatmap].map((c) => rgbaCss(c, (c[3] ?? 255) / 255)).join(',')})` }}
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                <span>low</span>
                <span>high</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
