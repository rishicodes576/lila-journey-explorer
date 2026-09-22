import { useEffect } from 'react'
import { useStore, BASE_PLAY_MS } from './store'
import { writeUrl } from './lib/url'
import MapCanvas from './components/MapCanvas'
import Sidebar from './components/Sidebar'
import Timeline from './components/Timeline'
import Legend from './components/Legend'
import TopBar from './components/TopBar'

export default function App() {
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const init = useStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  // keep the URL in sync with the view so any state is shareable
  useEffect(
    () =>
      useStore.subscribe((st) => writeUrl({ map: st.map, date: st.date, matchId: st.matchId, heatmap: st.heatmap })),
    [],
  )

  // ---- playback animation loop (drives currentTime while playing) ----
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const s = useStore.getState()
      if (s.playing && s.matchData) {
        const dur = s.matchData.durationMs || 1
        const next = s.currentTime + dt * (dur / BASE_PLAY_MS) * s.speed
        if (next >= dur) {
          s.setTime(dur)
          s.setPlaying(false)
        } else {
          s.setTime(next)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="mb-2 text-lg font-semibold text-[#e66767]">Could not load data</h1>
          <p className="max-w-md text-sm text-[var(--text-secondary)]">{error}</p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Did you run <code className="rounded bg-[var(--surface-2)] px-1">npm run preprocess</code>?
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                Loading telemetry…
              </div>
            ) : (
              <>
                <MapCanvas />
                <Legend />
              </>
            )}
          </div>
          <Timeline />
        </div>
      </div>
    </div>
  )
}
