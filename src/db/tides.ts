import type { TidePoint } from '../iwls/client';
import { addUtcDays, dayBucket, startOfUtcDay } from '../lib/time';
import {
  getDB,
  type PredictionRecord,
  type StationRecord,
  type SyncMetaRecord,
} from './schema';

/* -------------------------------------------------------------------------- */
/* Stations                                                                   */
/* -------------------------------------------------------------------------- */

export async function listAllStations(): Promise<StationRecord[]> {
  const db = await getDB();
  return db.getAll('stations');
}

export async function listPinnedStations(): Promise<StationRecord[]> {
  const db = await getDB();
  const all = await db.getAll('stations');
  return all.filter((s) => s.pinned).sort((a, b) => a.pinOrder - b.pinOrder);
}

export async function getStation(id: string): Promise<StationRecord | undefined> {
  const db = await getDB();
  return db.get('stations', id);
}

export async function putStations(records: StationRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('stations', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function updateStationPinning(
  updates: Array<{ id: string; pinned: boolean; pinOrder: number }>,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('stations', 'readwrite');
  for (const u of updates) {
    const existing = await tx.store.get(u.id);
    if (existing) {
      await tx.store.put({ ...existing, pinned: u.pinned, pinOrder: u.pinOrder });
    }
  }
  await tx.done;
}

/* -------------------------------------------------------------------------- */
/* Predictions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Bucket tide points by UTC day and upsert them. One transaction for the
 * whole batch so partial writes are impossible.
 */
export async function putPredictions(
  stationId: string,
  points: TidePoint[],
  fetchedAt: number = Date.now(),
): Promise<void> {
  if (!points.length) return;
  const buckets = new Map<string, TidePoint[]>();
  for (const p of points) {
    const key = dayBucket(p.t);
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(p);
  }

  const db = await getDB();
  const tx = db.transaction('predictions', 'readwrite');
  for (const [bucket, bucketPoints] of buckets) {
    bucketPoints.sort((a, b) => a.t - b.t);
    const record: PredictionRecord = {
      stationId,
      dayBucket: bucket,
      points: bucketPoints,
      fetchedAt,
    };
    await tx.store.put(record);
  }
  await tx.done;
}

/**
 * Summary of the predictions cache for a single station. Used by the UI
 * to tell the user how much data it's holding and how far into the future
 * it reaches.
 */
export interface StationCacheStats {
  totalPoints: number;
  dayBuckets: number;
  firstPointMs: number | undefined;
  lastPointMs: number | undefined;
  fetchedAt: number | undefined;
}

/** Walk every prediction record for a station and tally up the cache. */
export async function getCacheStats(stationId: string): Promise<StationCacheStats> {
  const db = await getDB();
  const records = await db.getAllFromIndex('predictions', 'by-station', stationId);
  let totalPoints = 0;
  let firstPointMs: number | undefined;
  let lastPointMs: number | undefined;
  let fetchedAt: number | undefined;
  for (const rec of records) {
    totalPoints += rec.points.length;
    if (rec.points.length) {
      const first = rec.points[0].t;
      const last = rec.points[rec.points.length - 1].t;
      if (firstPointMs === undefined || first < firstPointMs) firstPointMs = first;
      if (lastPointMs === undefined || last > lastPointMs) lastPointMs = last;
    }
    if (fetchedAt === undefined || rec.fetchedAt > fetchedAt) fetchedAt = rec.fetchedAt;
  }
  return {
    totalPoints,
    dayBuckets: records.length,
    firstPointMs,
    lastPointMs,
    fetchedAt,
  };
}

/**
 * Return all tide points for station within [fromMs, toMs] (inclusive).
 * Reads every overlapping UTC day-bucket and stitches them together.
 */
export async function getPointsInRange(
  stationId: string,
  fromMs: number,
  toMs: number,
): Promise<TidePoint[]> {
  if (toMs < fromMs) return [];
  const db = await getDB();
  const result: TidePoint[] = [];
  const start = startOfUtcDay(fromMs);
  for (let cursor = start; cursor <= toMs; cursor = addUtcDays(cursor, 1)) {
    const key: [string, string] = [stationId, dayBucket(cursor)];
    const rec = await db.get('predictions', key);
    if (!rec) continue;
    for (const p of rec.points) {
      if (p.t >= fromMs && p.t <= toMs) result.push(p);
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Sync metadata                                                              */
/* -------------------------------------------------------------------------- */

export async function getSyncMeta(stationId: string): Promise<SyncMetaRecord | undefined> {
  const db = await getDB();
  return db.get('syncMeta', stationId);
}

export async function setSyncMeta(meta: SyncMetaRecord): Promise<void> {
  const db = await getDB();
  await db.put('syncMeta', meta);
}

export async function getAllSyncMeta(): Promise<SyncMetaRecord[]> {
  const db = await getDB();
  return db.getAll('syncMeta');
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const rec = await db.get('settings', key);
  return rec?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value });
}
