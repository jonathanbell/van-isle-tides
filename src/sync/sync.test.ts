import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDbForTests } from '../db/schema';
import { getPointsInRange, putStations, setSyncMeta } from '../db/tides';
import {
  isStale,
  syncAllPinned,
  syncStation,
  windowAroundNow,
  STALE_AFTER_MS,
  type SyncProgress,
} from './sync';

const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await __resetDbForTests();
  await putStations([
    {
      id: 'stn',
      code: '00001',
      name: 'Test Station',
      lat: 48.4,
      lon: -123.4,
      timeSeries: ['wlp', 'wlp-hilo'],
      pinned: true,
      pinOrder: 0,
    },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('syncStation', () => {
  it('fetches wlp + wlp-hilo and writes both to IDB', async () => {
    const now = Date.parse('2026-04-05T12:00:00Z');
    const predictions = [
      { eventDate: '2026-04-05T12:00:00Z', value: 1.5 },
      { eventDate: '2026-04-05T12:15:00Z', value: 1.6 },
    ];
    const hilo = [
      { eventDate: '2026-04-05T18:00:00Z', value: 3.1, eventType: 'HIGH' },
    ];

    const fn = vi.fn(async (url: string | URL) => {
      const href = typeof url === 'string' ? url : url.href;
      const body = href.includes('wlp-hilo') ? hilo : predictions;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fn);

    const result = await syncStation('stn', now);
    expect(result.ok).toBe(true);
    expect(result.points).toBe(2);
    expect(result.hiLo).toBe(1);

    const got = await getPointsInRange(
      'stn',
      Date.parse('2026-04-05T00:00:00Z'),
      Date.parse('2026-04-05T23:59:59Z'),
    );
    expect(got).toHaveLength(2);
  });

  it('skips when last sync is within 60s', async () => {
    const now = Date.parse('2026-04-05T12:00:00Z');
    await setSyncMeta({
      stationId: 'stn',
      lastSyncedAt: now - 30_000,
      rangeFromMs: 0,
      rangeToMs: 0,
    });
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);

    const result = await syncStation('stn', now);
    expect(result.skipped).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns a failure result when the fetch errors, preserving existing cache', async () => {
    const now = Date.parse('2026-04-05T12:00:00Z');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    const result = await syncStation('stn', now);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
  });
});

describe('syncAllPinned progress', () => {
  it('emits one progress event per pinned station plus a final done event', async () => {
    // Add a second pinned station so we actually iterate.
    await putStations([
      {
        id: 'stn2',
        code: '00002',
        name: 'Second Station',
        lat: 49,
        lon: -125,
        timeSeries: ['wlp', 'wlp-hilo'],
        pinned: true,
        pinOrder: 1,
      },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    );

    const events: SyncProgress[] = [];
    await syncAllPinned(Date.parse('2026-04-05T12:00:00Z'), (p) => events.push({ ...p }));

    // 2 "starting station N" events + 1 final "done" event.
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ done: 0, total: 2, currentId: 'stn' });
    expect(events[1]).toMatchObject({ done: 1, total: 2, currentId: 'stn2' });
    expect(events[2]).toMatchObject({ done: 2, total: 2 });
    expect(events[2].currentId).toBeUndefined();
  });
});

describe('isStale and windowAroundNow', () => {
  it('treats undefined as stale', () => {
    expect(isStale(undefined)).toBe(true);
  });

  it('is stale just over the 14-day threshold', () => {
    const now = Date.now();
    expect(isStale(now - STALE_AFTER_MS - 1000, now)).toBe(true);
    expect(isStale(now - STALE_AFTER_MS + 1000, now)).toBe(false);
  });

  it('windowAroundNow keeps [-6h, +42h]', () => {
    const now = Date.parse('2026-04-05T12:00:00Z');
    const pts = [
      { t: now - 7 * 3600_000, v: 1 }, // out
      { t: now - 1 * 3600_000, v: 2 }, // in
      { t: now + 20 * 3600_000, v: 3 }, // in
      { t: now + 43 * 3600_000, v: 4 }, // out
    ];
    expect(windowAroundNow(pts, now).map((p) => p.v)).toEqual([2, 3]);
  });
});
