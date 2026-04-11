import type { HiLoEvent, TidePoint } from '../iwls/client';

/**
 * Derive high/low events from a 15-min tide point series via local peak
 * detection. Used as a fallback when the in-memory hi/lo cache is empty
 * (e.g. cold reload before any sync has run) — without this the HiLoStrip
 * and chart markers stay blank until the user hits Refresh, even though
 * the points themselves are cached in IDB.
 *
 * Accuracy is capped at the sample resolution (15 min) which is plenty for
 * the UI label; real IWLS hi/lo events are minute-precise and are used
 * once a sync populates the cache.
 */
export function deriveHiLo(points: TidePoint[]): HiLoEvent[] {
  if (points.length < 3) return [];
  const events: HiLoEvent[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].v;
    const cur = points[i].v;
    const next = points[i + 1].v;
    // Strict on one side + non-strict on the other so a flat plateau
    // (two equal samples at a peak) is emitted exactly once.
    if (cur > prev && cur >= next) {
      events.push({ t: points[i].t, v: cur, type: 'HIGH' });
    } else if (cur < prev && cur <= next) {
      events.push({ t: points[i].t, v: cur, type: 'LOW' });
    }
  }
  return events;
}
