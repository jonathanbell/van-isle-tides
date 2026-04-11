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

// Pinned-by-default set (display order). These appear in the switcher on
// first launch; users can unpin any of them via the edit UI.
const PINNED_CODES: string[] = [
  '07130', // Oak Bay
  '07913', // Harmac
  '08105', // Seymour Narrows
  '08290', // Port McNeill
  '08790', // Cape Scott
  '08720', // Bunsby Islands
  '08665', // Esperanza
  '08615', // Tofino
];

// Catalog set — seeded but not pinned. Shown in the "+ Add station" sheet
// and available as Near Me candidates. Picked for broad Van-Isle coverage
// so that Near Me on a boat almost anywhere around the island finds a
// station within ~15–25 km.
const UNPINNED_CODES: string[] = [
  // Greater Victoria / south coast
  '07010', // Point No Point
  '07020', // Sooke
  '07080', // Pedder Bay
  '07109', // Esquimalt Harbour
  '07120', // Victoria Harbour
  '07260', // Sidney
  '07277', // Patricia Bay
  '07280', // Brentwood Bay
  // Gulf Islands / Cowichan
  '07310', // Cowichan Bay
  '07330', // Fulford Harbour
  '07350', // Bedwell Harbour
  '07407', // Ganges
  '07420', // Montague Harbour
  '07455', // Chemainus
  '07460', // Ladysmith
  '07471', // Preedy Harbour
  '07535', // Dionisio Point
  // East-central Van Isle
  '07917', // Nanaimo Harbour
  '07930', // Nanoose Bay
  '07940', // French Creek
  '07953', // Hornby Island
  '07955', // Denman Island
  '07965', // Comox
  // Campbell River / Quadra / Discovery Islands
  '08035', // Heriot Bay
  '08074', // Campbell River
  '08079', // Quathiaski Cove
  // North-east Van Isle
  '08215', // Kelsey Bay
  '08258', // Lagoon Cove
  '08280', // Alert Bay
  '08364', // Sullivan Bay
  '08408', // Port Hardy
  // West coast
  '08525', // Port Renfrew
  '08545', // Bamfield
  '08575', // Port Alberni
  '08595', // Ucluelet
  // North-west inlets / Nootka / Kyuquot
  '08650', // Gold River
  '08664', // Ceepeecee
  '08670', // Zeballos
  '08710', // Kyuquot
  '08715', // Fair Harbour
  // North island / Quatsino Sound
  '08735', // Winter Harbour
  '08750', // Port Alice
  '08765', // Coal Harbour
];

const CURATED_CODES: string[] = [...PINNED_CODES, ...UNPINNED_CODES];
const PINNED_COUNT = PINNED_CODES.length;

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
