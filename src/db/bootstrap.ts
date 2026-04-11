import seed from '../data/stations.seed.json';
import { listAllStations, putStations } from './tides';
import type { StationRecord } from './schema';

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

/**
 * Populate the stations store from the bundled seed JSON on first ever launch.
 * Idempotent — does nothing if the store already has rows.
 */
export async function bootstrapStationsIfEmpty(): Promise<void> {
  const existing = await listAllStations();
  if (existing.length > 0) return;
  const records: StationRecord[] = (seed as SeedStation[]).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    timeSeries: s.timeSeries,
    pinned: s.pinned,
    pinOrder: s.pinOrder,
  }));
  await putStations(records);
}
