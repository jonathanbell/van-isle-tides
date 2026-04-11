/**
 * Build-time station seed generator.
 *
 * Run manually when you want to refresh the bundled station list:
 *   npm run seed:stations
 *
 * It hits the IWLS /stations endpoint once (no auth, open CORS) and writes
 * src/data/stations.seed.json with the curated Van-Isle subset. The first six
 * entries are marked as pinned in the order the user requested.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IWLS_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';

// Order matters: the first six become the default pinned set.
const CURATED_CODES: string[] = [
  // Pinned (user-chosen)
  '07120', // Victoria Harbour
  '07109', // Esquimalt Harbour
  '08545', // Bamfield
  '08615', // Tofino
  '08408', // Port Hardy
  '08790', // Cape Scott
  // Curated extras around Vancouver Island
  '07277', // Patricia Bay
  '07330', // Fulford Harbour
  '07460', // Point Atkinson (mainland, reference)
  '07535', // Nanaimo
  '07917', // Campbell River
  '08074', // Alert Bay
  '08525', // Ucluelet
  '08735', // Winter Harbour
  '08976', // Kyuquot
];

const PINNED_COUNT = 6;

interface IwlsStationRaw {
  id: string;
  code: string;
  officialName: string;
  latitude: number;
  longitude: number;
  timeSeries?: Array<{ code: string }>;
  operating?: boolean;
}

interface SeedStation {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  timeSeries: string[];
  pinned: boolean;
  pinOrder: number;
}

async function fetchStation(code: string): Promise<IwlsStationRaw | null> {
  const url = `${IWLS_BASE}/stations?code=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    console.error(`  ! ${code}: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as IwlsStationRaw[];
  if (!Array.isArray(body) || body.length === 0) {
    console.error(`  ! ${code}: no results`);
    return null;
  }
  return body[0];
}

async function main(): Promise<void> {
  console.log(`Fetching ${CURATED_CODES.length} stations from IWLS…`);
  const seed: SeedStation[] = [];

  for (let i = 0; i < CURATED_CODES.length; i++) {
    const code = CURATED_CODES[i];
    const raw = await fetchStation(code);
    if (!raw) continue;
    const pinned = i < PINNED_COUNT;
    seed.push({
      id: raw.id,
      code: raw.code,
      name: raw.officialName,
      lat: raw.latitude,
      lon: raw.longitude,
      timeSeries: raw.timeSeries?.map((t) => t.code) ?? [],
      pinned,
      pinOrder: pinned ? i : Number.MAX_SAFE_INTEGER,
    });
    console.log(`  ✓ ${raw.code} ${raw.officialName}${pinned ? ' [pinned]' : ''}`);
    // Polite spacing: ≥350ms between calls (well under 3 req/s rate limit).
    await new Promise((r) => setTimeout(r, 400));
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '..', 'src', 'data', 'stations.seed.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(seed, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${seed.length} stations → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
