import { useEffect, useState } from 'react';
import type { HiLoEvent, TidePoint } from '../iwls/client';
import {
  getCacheStats,
  getPointsInRange,
  getSyncMeta,
  type StationCacheStats,
} from '../db/tides';
import { getCachedHiLo } from '../sync/sync';
import { deriveHiLo } from '../lib/hilo';

export interface TideWindow {
  points: TidePoint[];
  hiLo: HiLoEvent[];
  lastSyncedAt?: number;
  fromMs: number;
  toMs: number;
  cacheStats: StationCacheStats;
}

interface UseTideDataArgs {
  stationId: string | undefined;
  /** Bumps when sync finishes so the hook re-reads IDB. */
  refreshToken: number;
  now?: number;
}

export function useTideData({ stationId, refreshToken, now }: UseTideDataArgs):
  | { state: 'loading' }
  | { state: 'ready'; data: TideWindow }
  | { state: 'empty' } {
  const [result, setResult] = useState<
    { state: 'loading' } | { state: 'ready'; data: TideWindow } | { state: 'empty' }
  >({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!stationId) {
      setResult({ state: 'empty' });
      return;
    }
    setResult({ state: 'loading' });

    const nowMs = now ?? Date.now();
    const fromMs = nowMs - 6 * 60 * 60 * 1000;
    const toMs = nowMs + 42 * 60 * 60 * 1000;

    void (async () => {
      const [points, meta, cacheStats] = await Promise.all([
        getPointsInRange(stationId, fromMs, toMs),
        getSyncMeta(stationId),
        getCacheStats(stationId),
      ]);
      if (cancelled) return;
      if (!points.length) {
        setResult({ state: 'empty' });
        return;
      }
      // Prefer IWLS minute-precise hi/lo from the in-memory cache. On
      // cold reload that cache is empty (it's not persisted to IDB), so
      // fall back to local peak detection over the 15-min points — the
      // strip/markers render immediately instead of waiting for Refresh.
      const cached = getCachedHiLo(stationId);
      const source = cached && cached.length ? cached : deriveHiLo(points);
      const hiLo = source.filter((e) => e.t >= fromMs && e.t <= toMs);
      setResult({
        state: 'ready',
        data: {
          points,
          hiLo,
          lastSyncedAt: meta?.lastSyncedAt,
          fromMs,
          toMs,
          cacheStats,
        },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [stationId, refreshToken, now]);

  return result;
}
