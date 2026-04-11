import { beforeEach, describe, expect, it } from 'vitest';
import { __resetDbForTests } from './schema';
import {
  getCacheStats,
  getPointsInRange,
  listAllStations,
  listPinnedStations,
  putPredictions,
  putStations,
} from './tides';

beforeEach(async () => {
  await __resetDbForTests();
});

describe('stations store', () => {
  it('round-trips pinned/unpinned and returns pinned in order', async () => {
    await putStations([
      { id: 'a', code: '1', name: 'A', lat: 0, lon: 0, timeSeries: [], pinned: true, pinOrder: 1 },
      { id: 'b', code: '2', name: 'B', lat: 0, lon: 0, timeSeries: [], pinned: true, pinOrder: 0 },
      { id: 'c', code: '3', name: 'C', lat: 0, lon: 0, timeSeries: [], pinned: false, pinOrder: 99 },
    ]);

    const all = await listAllStations();
    expect(all).toHaveLength(3);

    const pinned = await listPinnedStations();
    expect(pinned.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('predictions: bucketing and range queries', () => {
  it('groups points by UTC day and stitches them back together', async () => {
    // Straddle a UTC day boundary so we hit two buckets.
    const points = [
      { t: Date.parse('2026-04-05T22:00:00Z'), v: 1.0 },
      { t: Date.parse('2026-04-05T23:00:00Z'), v: 1.5 },
      { t: Date.parse('2026-04-06T00:00:00Z'), v: 2.0 },
      { t: Date.parse('2026-04-06T01:00:00Z'), v: 2.5 },
      { t: Date.parse('2026-04-06T02:00:00Z'), v: 3.0 },
    ];
    await putPredictions('s1', points);

    const got = await getPointsInRange(
      's1',
      Date.parse('2026-04-05T22:30:00Z'),
      Date.parse('2026-04-06T01:30:00Z'),
    );
    expect(got.map((p) => p.v)).toEqual([1.5, 2.0, 2.5]);
  });

  it('returns nothing for an empty store', async () => {
    const got = await getPointsInRange('unknown', 0, Date.now() + 1_000_000);
    expect(got).toEqual([]);
  });

  it('getCacheStats tallies totals and exposes first/last point across buckets', async () => {
    const points = [
      { t: Date.parse('2026-04-05T22:00:00Z'), v: 1.0 },
      { t: Date.parse('2026-04-05T23:00:00Z'), v: 1.5 },
      { t: Date.parse('2026-04-06T00:00:00Z'), v: 2.0 },
      { t: Date.parse('2026-04-06T01:00:00Z'), v: 2.5 },
    ];
    await putPredictions('stats', points, 1234);
    const stats = await getCacheStats('stats');
    expect(stats.totalPoints).toBe(4);
    expect(stats.dayBuckets).toBe(2);
    expect(stats.firstPointMs).toBe(Date.parse('2026-04-05T22:00:00Z'));
    expect(stats.lastPointMs).toBe(Date.parse('2026-04-06T01:00:00Z'));
    expect(stats.fetchedAt).toBe(1234);
  });

  it('getCacheStats returns zeros for an unknown station', async () => {
    const stats = await getCacheStats('nope');
    expect(stats.totalPoints).toBe(0);
    expect(stats.dayBuckets).toBe(0);
    expect(stats.firstPointMs).toBeUndefined();
    expect(stats.lastPointMs).toBeUndefined();
  });

  it('is idempotent: re-writing the same points overwrites, not duplicates', async () => {
    const points = [
      { t: Date.parse('2026-04-05T00:00:00Z'), v: 1.1 },
      { t: Date.parse('2026-04-05T00:15:00Z'), v: 1.2 },
    ];
    await putPredictions('s2', points);
    await putPredictions('s2', points);
    const got = await getPointsInRange(
      's2',
      Date.parse('2026-04-05T00:00:00Z'),
      Date.parse('2026-04-05T23:59:59Z'),
    );
    expect(got).toHaveLength(2);
  });
});
