# Van-Isle Tides

An offline-first Progressive Web App for tidal heights at stations around
Vancouver Island. Designed for fishing, boating, and beach trips to places
that have no cell signal — the app caches a 30-day prediction window on
first sync and runs fully offline from there.

Data comes from the Canadian Hydrographic Service
[IWLS API](https://api-iwls.dfo-mpo.gc.ca/api/v1). Tide predictions are
astronomical and stable, so once a future date is cached it doesn't need
re-fetching.

## Features

- **Works offline** after one online sync. The app layer owns the IWLS
  cache in IndexedDB; the service worker precaches only the app shell.
- **48-hour tide chart** — tide curve, "now" line, high/low markers,
  sunrise/sunset shading computed locally via [SunCalc](https://github.com/mourner/suncalc),
  and a hover tooltip that linearly interpolates the tide height at the
  cursor.
- **Sun mode** — a forced high-contrast theme for direct-sunlight
  readability: black-on-cream, thicker chart strokes, larger type, ≥44 px
  hit targets.
- **Near me** — one-tap GPS → nearest station in the bundled catalog.
  Auto-pins the pick if it isn't already pinned, triggers a one-station
  sync in the background, and shows the distance in the button label
  (warning text when the match is >25 km away, so the user knows the
  catalog didn't have anything closer).
- **Pin / unpin any station** — the switcher lists pinned stations with
  an × to unpin; a "+ Add station" sheet lists the full 51-station
  Van-Isle catalog so the user can pin any of them on demand.
- **Installable** — PWA manifest and icons for iOS/Android home screens.
- **Stale cache warning** — amber banner at 14 days, chart still renders
  from cache.

## Stack

Vite + React + TypeScript, [uPlot](https://github.com/leeoniya/uPlot) for
the canvas chart, [idb](https://github.com/jakearchibald/idb) for typed
IndexedDB access, [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
(Workbox) for the service worker, and Vitest + fake-indexeddb for tests.
The app is a pure static build deployed to GitHub Pages — no backend.

## Getting started

Requires Node 20+.

```bash
git clone <this-repo>
cd van-isle-tides
npm install
npm run dev              # http://localhost:5173/van-isle-tides/
```

The dev server uses the project base path `/van-isle-tides/` so URLs match
production. On first load the app seeds the 51-station Vancouver Island
catalog from `src/data/stations.seed.json` into IndexedDB (8 pinned by
default, 43 additional stations discoverable via "+ Add station" or
Near Me), then syncs 30 days of predictions for every pinned station.

### Useful scripts

```bash
npm run dev              # Vite dev server with HMR
npm run build            # Typecheck + production bundle into dist/
npm run preview          # Serve dist/ to verify the production build
npm run typecheck        # tsc -b --noEmit
npm run test             # Vitest in watch mode
npm run test:ci          # Single-shot run (the CI gate)
npm run seed:stations    # Refresh src/data/stations.seed.json from live IWLS
```

Single test file: `npx vitest run src/sync/sync.test.ts`.
Single test by name: `npx vitest run -t 'skips when last sync is within 60s'`.

## Project layout

```
src/
├── iwls/          # IWLS API client + rate-limited queue (the only network surface)
├── db/            # IndexedDB schema, read/write helpers, first-boot seeding
├── sync/          # 30-day-window sync orchestration
├── hooks/         # useTideData, useTheme, useGeolocation
├── components/    # TideChart (uPlot), StationHeader, HiLoStrip, …
├── lib/           # Pure helpers: time (UTC/local), sun, geo
├── styles/        # CSS tokens (light/dark/sun) + app styles
└── data/          # Bundled station seed JSON
scripts/           # Manual seed generator
test/              # Vitest setup: fake-indexeddb + jest-dom
```

See `CLAUDE.md` for the architectural conventions — in particular the two
distinct "day" concepts (UTC day buckets for storage vs. America/Vancouver
local days for rendering), the sync invariants, and the sun-mode rules.

## Deployment

Push to `main` → GitHub Actions runs typecheck and tests, then builds and
publishes to GitHub Pages. Deploy is gated on `needs: verify`, so a failing
test leaves the previously deployed site untouched.

To host it yourself:

1. Fork the repo.
2. Settings → Pages → Source = **GitHub Actions**.
3. Push to `main`. First deploy lands at
   `https://<user>.github.io/van-isle-tides/`.
4. For a custom domain, drop `base` in `vite.config.ts` and the
   `start_url`/`scope` entries in the PWA manifest.

## Testing the offline path

The critical path for this app is "works with no signal". Manual
verification:

1. `npm run build && npm run preview`, load once online.
2. DevTools → Application → Service Workers: SW activated; IndexedDB `vit`
   has seeded stations and 30-day prediction windows for all pinned stations.
3. Network panel → **Offline**, hard-reload. App must boot and render the
   last-active station with no errors.
4. Install to a phone home screen, put the phone in airplane mode, cold
   launch. All pinned stations should render.

## Data source and attribution

Tidal predictions and station metadata come from the
[DFO/CHS Integrated Water Level System (IWLS) API](https://api-iwls.dfo-mpo.gc.ca/swagger-ui.html).
The API is open and unauthenticated; please respect the rate limits
(30 req/min, 3 req/s) enforced client-side by `src/iwls/queue.ts`.

## License

Personal project — no license specified.
