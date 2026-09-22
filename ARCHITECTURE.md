# Architecture

## What I built & why
A **pure static single-page app** backed by a **one-time preprocessing step** — no server.
The dataset is small (89k events) and *fixed* (historical, not live), so a backend would add
hosting cost, latency, and moving parts for zero functional gain. Preprocessing the Parquet
once into compact JSON lets the browser do all filtering, heatmapping, and playback instantly,
and the whole thing deploys to any static host as flat files.

| Piece | Choice | Why |
|---|---|---|
| Parquet read | **hyparquet** (Node, zero-dep) | Python 3.14 had no pyarrow wheels; hyparquet reads the byte-array `event` and ms-`ts` columns cleanly. |
| Image prep | **sharp** | The raw minimaps are 4320²–9000² (≈24 MB). Downscaled to 2048px WebP (~185 KB each). |
| Rendering | **deck.gl** `OrthographicView` | GPU layers for the exact jobs here: `BitmapLayer` (basemap), `ScatterplotLayer`/`IconLayer` (events), `PathLayer` + `TripsLayer` (animated journeys), `HeatmapLayer` (zones). Smooth pan/zoom, little custom render code. |
| App | **React + Vite + TS**, **Zustand**, **Tailwind** | Fast, typed, tiny state layer, dark game-dev UI. |
| Colors | **validated** via the dataviz palette validator | Event colors encode 3 semantic families (kill/death/loot) that pass the CVD + normal-vision all-pairs test; the specific event is carried by a distinct **icon shape** + legend. |
| Hosting | **Vercel** (static) | Instant shareable URL; `base: './'` keeps assets portable to any host. |

## Data flow
```
February_*/**.nakama-0 (Parquet)
        │  scripts/preprocess.mjs  (npm run preprocess)
        ▼
public/data/manifest.json     global index: maps config, 796 matches, 339 players, stats   (always loaded)
public/data/maps/<map>.json   columnar: every event + every position sample for a map        (on map select)
public/data/matches/<id>.json full per-player journeys (path + markers)                       (on match select)
public/data/analysis.json     precomputed insight metrics (seeds INSIGHTS.md)
public/minimaps/<map>.webp     optimised basemaps
        │  fetch (cached)  →  Zustand store  →  deck.gl layers + React UI
        ▼
        Browser
```
Two-tier lazy loading keeps every request small: browse from the manifest, pull a **map** file for
heatmaps/overview, pull a **match** file only when replaying one. View state (map/date/match/heatmap)
is mirrored into the URL, so **any view is a shareable link**.

## Coordinate mapping (the tricky part)
The README's world→minimap transform is **UV-based, so it's resolution-independent**. I exploit that:
everything renders in a fixed **1024-unit logical square** regardless of the (huge, varying) real image
sizes. For map config `{scale, originX, originZ}`:

```
u = (x - originX) / scale        v = (z - originZ) / scale        # x,z only; y is elevation
point = [ u*1024 , v*1024 ]      # deck.gl OrthographicView, flipY:false (Y-up)
basemap = BitmapLayer bounds [0,0,1024,1024]
```
Because the **basemap image and the data points use the same `u,v`**, they align pixel-perfectly at any
zoom. deck's Y-up view means `v*1024` is simply the Y-up equivalent of the README's Y-down
`pixel_y = (1-v)*1024`. This math lives in **one place** (`scripts/preprocess.mjs` and its mirror
`src/lib/coords.ts`) so the pipeline and UI can never diverge.

*Verification:* README worked example (Ambrose, `x=-301.45, z=-355.55`) → `u=0.0762, v=0.1305` →
logical `(78, 133.6)` = the README's image-space `(78, 890)` flipped — confirmed both numerically and
visually (points land on the map's built-up core, never in water).

## Assumptions & data quirks handled
- **Minimaps aren't 1024²** as the README states — they're 4320²/2160²/9000². UV mapping makes this
  irrelevant to correctness; I downscale to 2048px WebP for the web.
- **`event` is bytes** → decoded to UTF-8 (hyparquet does this).
- **Bot vs human = numeric vs UUID `user_id`.** Human/bot layer filters use the journey owner's type.
- **`ts` is elapsed-in-match encoded as ms-since-epoch** and spans only ~0.4 s per match. I normalise
  per match (`t = ts − min(ts)`) and **decouple playback from real ts** — a match plays over a fixed
  ~12 s wall-clock window (speed-adjustable), with the raw match-time shown for honesty.
- **The export is a partial sample** — ≈1.6 files/match, 93% single-player matches. Aggregate spatial
  patterns are representative; per-match rosters are not. (Called out in INSIGHTS.)

## Tradeoffs
| Considered | Decided | Note |
|---|---|---|
| Live DuckDB/FastAPI backend | Static preprocess | No benefit on fixed data; simpler, cheaper, faster. |
| Ship raw Parquet + parse in browser | Preprocess to JSON | Avoids shipping a Parquet reader + 24 MB images to every client. |
| Hand-rolled Canvas 2D | deck.gl | GPU perf for 12k+ markers + animated trips; far less custom code to get wrong. |
| One big data bundle | Tiered manifest/map/match | Each fetch stays small; match detail loads only on demand. |
| Color-per-event (6 hues) | 3 color families + 6 shapes | 6 hues fail the CVD all-pairs test; shape is the accessible primary channel. |
