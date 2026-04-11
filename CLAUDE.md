# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Vite dev server with HMR
npm run build            # tsc -b && vite build (typecheck + production bundle)
npm run typecheck        # tsc -b --noEmit
npm run test             # vitest watch mode
npm run test:ci          # vitest --run (CI gate)
npm run preview          # serve dist/ to verify the production build
npm run seed:stations    # refresh src/data/stations.seed.json from live IWLS
```

Run a single test file: `npx vitest run src/sync/sync.test.ts`.
Run a single test by name: `npx vitest run -t 'skips when last sync is within 60s'`.

Vitest uses `jsdom` + `fake-indexeddb/auto` (wired in `test/setup.ts`). IDB-touching
tests must call `__resetDbForTests()` from `src/db/schema.ts` in `beforeEach` — it
closes any open connection *before* deleting the database, which prevents a deadlock
between Workbox and fake-indexeddb.

Deployment is push-to-`main` only via `.github/workflows/main.yml`: the `verify` job
runs `typecheck` and `test:ci`, and the `deploy` job is gated on `needs: verify`. A
failing test leaves the previously deployed site untouched.

## Architecture

Van-Isle Tides is a **static, offline-first PWA** for Vancouver Island tide heights.
The core design constraint: the app must work fully offline after one sync, because
the target users are in bays and coves with no signal. No backend exists — the app
is hosted on GitHub Pages and talks directly to the CHS IWLS API (open CORS).

### The offline contract

Everything flows through IndexedDB (`src/db/`). The UI **only** reads from IDB; the
sync layer is the sole writer. The "network vs. cache" question never reaches the
components — if a station has points in IDB, the chart renders.

Stores (schema.ts, v1):
- `stations` (keyPath `id`) — station metadata + `pinned`/`pinOrder`
- `predictions` (keyPath `[stationId, dayBucket]`) — points grouped by UTC day
- `syncMeta` (keyPath `stationId`) — `lastSyncedAt`, request range
- `settings` (keyPath `key`) — active station, sun-mode preference, etc.

**Day buckets are UTC, not local.** `dayBucket()` and the range-query stitching in
`getPointsInRange` must stay on UTC, or America/Vancouver DST transitions (March,
November) will skip or duplicate data at the boundary. Local Vancouver formatting is
reserved for the render layer (`formatLocalTime`, `formatLocalDate`, `localDayKey`).
There are two distinct "day" concepts — keep them separate:
- `dayBucket(epochMs)` → UTC `YYYY-MM-DD`, used as a DB key
- `localDayKey(epochMs)` → America/Vancouver `YYYY-MM-DD`, used for UI grouping

### IWLS client

`src/iwls/client.ts` is the only network surface. All fetches route through
`iwlsQueue.run(...)` (`src/iwls/queue.ts`), which enforces ≥350 ms spacing, a sliding
60 s window ≤30 req, a 15 s AbortController timeout, and 429 exponential backoff.
`IWLS_BASE` is a single constant so a proxy swap is one line if DFO ever tightens
CORS (see plan notes).

ISO timestamps sent to IWLS **must** be UTC with trailing `Z` (`toIwlsIso()`).

### Sync orchestration

`src/sync/sync.ts` pulls a 30-day window (`[today UTC, today+30d]`) per pinned
station, splits the response into UTC day buckets in `putPredictions`, and writes
one record per day in a single transaction. It emits `SyncProgress` events through
an `onProgress` callback so the UI can show "Syncing 3/6 — Tofino…".

Three invariants to preserve:
1. **60 s recency guard** — `syncStation` skips if `lastSyncedAt` is within 60 s.
   This is the React StrictMode double-mount guard; don't remove it.
2. **Partial failure preserves cache** — a failed fetch returns `{ok: false}` and
   does *not* touch `predictions` or `syncMeta`. The previously cached window stays.
3. **14-day staleness** — `isStale()` flips at `STALE_AFTER_MS`; header shows an
   amber banner but the chart still renders from cache.

Hi/lo events are held in an in-memory `Map` (`hiLoCache`) rather than IDB — they're
cheap to re-derive on next sync and only the 48 h live view needs them.

### Render window

The chart always shows `[now - 2 h, now + 46 h]` (48 h visible). `useTideData` reads
that window from IDB keyed on `{stationId, refreshToken, now}`; the sync orchestrator
bumps `refreshToken` on completion so the hook re-reads. The `now` value ticks every
60 s from `App.tsx` so the now-line and "synced Xm ago" label stay fresh without
re-fetching.

### Chart (uPlot)

`TideChart.tsx` is DOM-imperative. It rebuilds the uPlot instance on prop change
(via a `useLayoutEffect` + `ResizeObserver`) rather than mutating options — uPlot
options aren't safe to mutate mid-lifetime. A `MutationObserver` on `data-theme`
re-draws the existing plot on sun-mode toggle without a full rebuild.

Canvas overlays are drawn from uPlot hooks:
- `drawClear` — night shading (sunset→sunrise bands from `suncalc`) painted behind
  the curve
- `draw` — now-line + hi/lo markers + labels painted on top

All colors are read from CSS custom properties (`--chart-line`, `--chart-band`,
`--chart-now`, `--chart-stroke`, etc.) via `readThemeTokens()` so theme changes
propagate. Don't hardcode colors.

### Sun mode (direct-sunlight readability)

This is a hard requirement, not a nice-to-have. Theme tokens live in
`src/styles/tokens.css`. `:root[data-theme='sun']` overrides bump font sizes,
swap to black-on-cream, set `--chart-stroke: 4px`, and enforce ≥44 px hit targets.
`useTheme` persists the choice in the `settings` store. Don't introduce hairline
font weights, subtle greys, or thin chart strokes — they vanish in sunlight.

### Base path

`vite.config.ts` sets `base: '/van-isle-tides/'` for GitHub Pages project hosting.
All internal URLs must route through `import.meta.env.BASE_URL` or `new URL(...,
import.meta.url)`. A single hardcoded `/icons/foo.png` will 404 in production. The
PWA manifest's `start_url`/`scope` also hang off this base — keep them in sync.

### PWA service worker

`vite-plugin-pwa` (Workbox, `registerType: 'autoUpdate'`) precaches the app shell
(`**/*.{js,css,html,svg,png,woff2}`). **`runtimeCaching: []` is intentional** — the
app layer owns IWLS caching through IDB and needs TTL control the SW can't give it.
Don't add IWLS URLs to Workbox runtime caching.

### Station seed

`scripts/fetch-stations.ts` refreshes `src/data/stations.seed.json` by hitting IWLS
directly (manual; not run in CI). The first 6 entries are the pinned set
(Victoria/Esquimalt/Bamfield/Tofino/Port Hardy/Cape Scott) in display order.
`bootstrapStationsIfEmpty()` bulk-inserts the seed on first launch only — it's
idempotent and skips if the `stations` store already has rows.
