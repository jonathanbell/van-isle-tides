/**
 * Sync orchestrator. Fetches 30 days of wlp predictions per pinned station
 * and persists to IndexedDB. Idempotent; skipped if the station was synced
 * within the last 60s (dev HMR / StrictMode guard).
 */
import { getPredictions, getHiLo, type HiLoEvent, type TidePoint } from '../iwls/client';
import {
  getSyncMeta,
  listPinnedStations,
  putPredictions,
  setSyncMeta,
} from '../db/tides';
import { addUtcDays, startOfUtcDay, toIwlsIso } from '../lib/time';

export const SYNC_WINDOW_DAYS = 30;
export const SYNC_RECENCY_MS = 60_000;
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export interface SyncResult {
  stationId: string;
  ok: boolean;
  points?: number;
  hiLo?: number;
  skipped?: boolean;
  error?: string;
}

/** Live progress emitted by syncAllPinned as it walks the pinned list. */
export interface SyncProgress {
  /** Number of stations fully processed (0-indexed "current" is `done`). */
  done: number;
  total: number;
  /** The station currently being fetched, or undefined once finished. */
  currentId?: string;
  currentName?: string;
}

/**
 * In-memory cache of hi/lo events keyed by stationId. We don't persist these
 * yet — they're cheap to re-derive or re-fetch on next sync and the live view
 * only looks 48 h ahead.
 */
const hiLoCache = new Map<string, HiLoEvent[]>();

export function getCachedHiLo(stationId: string): HiLoEvent[] | undefined {
  return hiLoCache.get(stationId);
}

export async function syncStation(
  stationId: string,
  now: number = Date.now(),
): Promise<SyncResult> {
  const existing = await getSyncMeta(stationId);
  if (existing && now - existing.lastSyncedAt < SYNC_RECENCY_MS) {
    return { stationId, ok: true, skipped: true };
  }

  const fromMs = startOfUtcDay(now);
  const toMs = addUtcDays(fromMs, SYNC_WINDOW_DAYS);
  const fromISO = toIwlsIso(fromMs);
  const toISO = toIwlsIso(toMs);

  try {
    const [points, hilo] = await Promise.all([
      getPredictions(stationId, fromISO, toISO),
      getHiLo(stationId, fromISO, toISO).catch(() => [] as HiLoEvent[]),
    ]);
    await putPredictions(stationId, points, now);
    hiLoCache.set(stationId, hilo);
    await setSyncMeta({
      stationId,
      lastSyncedAt: now,
      rangeFromMs: fromMs,
      rangeToMs: toMs,
    });
    return { stationId, ok: true, points: points.length, hiLo: hilo.length };
  } catch (err) {
    return {
      stationId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Sync every pinned station. Returns a result per station. Emits
 * progress events before each station starts and once when the whole
 * batch is done, so the UI can show "Syncing 2/6 — Tofino…".
 */
export async function syncAllPinned(
  now: number = Date.now(),
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult[]> {
  const pinned = await listPinnedStations();
  const results: SyncResult[] = [];
  for (let i = 0; i < pinned.length; i++) {
    const station = pinned[i];
    onProgress?.({
      done: i,
      total: pinned.length,
      currentId: station.id,
      currentName: station.name,
    });
    results.push(await syncStation(station.id, now));
  }
  onProgress?.({ done: pinned.length, total: pinned.length });
  return results;
}

export function isStale(lastSyncedAt: number | undefined, now: number = Date.now()): boolean {
  if (!lastSyncedAt) return true;
  return now - lastSyncedAt > STALE_AFTER_MS;
}

/** Extract a 48h window (now-2h .. now+46h) from a set of points. */
export function windowAroundNow(
  points: TidePoint[],
  now: number = Date.now(),
): TidePoint[] {
  const from = now - 2 * 60 * 60 * 1000;
  const to = now + 46 * 60 * 60 * 1000;
  return points.filter((p) => p.t >= from && p.t <= to);
}
