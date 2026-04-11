import { describe, expect, it } from 'vitest';
import {
  addUtcDays,
  dayBucket,
  dayColorIndex,
  formatRelative,
  localDayBandsInRange,
  localDayKey,
  startOfUtcDay,
  toIwlsIso,
} from './time';

describe('dayBucket', () => {
  it('uses UTC, not local time', () => {
    // 23:30 UTC on 2026-04-05 is 16:30 Pacific (same UTC day).
    expect(dayBucket(Date.parse('2026-04-05T23:30:00Z'))).toBe('2026-04-05');
    // 00:15 UTC on 2026-04-06 is 17:15 Pacific on Apr 5 — bucket must be 04-06.
    expect(dayBucket(Date.parse('2026-04-06T00:15:00Z'))).toBe('2026-04-06');
  });

  it('is stable across the America/Vancouver DST transition', () => {
    // DST begins 2026-03-08 at 02:00 local (10:00 UTC) — shift forward 1h.
    const before = Date.parse('2026-03-08T09:30:00Z');
    const after = Date.parse('2026-03-08T10:30:00Z');
    expect(dayBucket(before)).toBe('2026-03-08');
    expect(dayBucket(after)).toBe('2026-03-08');
    // One day later must increment by exactly one.
    expect(dayBucket(addUtcDays(before, 1))).toBe('2026-03-09');
  });
});

describe('startOfUtcDay + addUtcDays', () => {
  it('returns 00:00:00Z of the UTC day', () => {
    const d = startOfUtcDay(Date.parse('2026-04-05T14:23:17Z'));
    expect(new Date(d).toISOString()).toBe('2026-04-05T00:00:00.000Z');
  });

  it('adds exactly 86_400_000 ms per day (UTC has no DST)', () => {
    const start = Date.parse('2026-04-05T00:00:00Z');
    expect(addUtcDays(start, 30) - start).toBe(30 * 86_400_000);
  });
});

describe('toIwlsIso', () => {
  it('strips milliseconds and keeps the trailing Z', () => {
    expect(toIwlsIso(Date.parse('2026-04-05T12:34:56.789Z'))).toBe('2026-04-05T12:34:56Z');
  });
});

describe('localDayKey + dayColorIndex', () => {
  it('localDayKey bins on America/Vancouver days, not UTC days', () => {
    // 2026-04-06T06:00Z is 23:00 Apr 5 Pacific — must be '2026-04-05'.
    expect(localDayKey(Date.parse('2026-04-06T06:00:00Z'))).toBe('2026-04-05');
    // 2026-04-06T07:30Z is 00:30 Apr 6 Pacific — must be '2026-04-06'.
    expect(localDayKey(Date.parse('2026-04-06T07:30:00Z'))).toBe('2026-04-06');
  });

  it('dayColorIndex gives consecutive local days distinct indices', () => {
    const d1 = Date.parse('2026-04-05T18:00:00Z'); // Apr 5 local
    const d2 = Date.parse('2026-04-06T18:00:00Z'); // Apr 6 local
    const d3 = Date.parse('2026-04-07T18:00:00Z'); // Apr 7 local
    const i1 = dayColorIndex(d1);
    const i2 = dayColorIndex(d2);
    const i3 = dayColorIndex(d3);
    expect(i1).not.toBe(i2);
    expect(i2).not.toBe(i3);
    expect(i1).not.toBe(i3); // all three distinct with default buckets=3
  });

  it('dayColorIndex is stable for the same local day', () => {
    const morning = Date.parse('2026-04-05T16:00:00Z'); // 09:00 Pacific
    const evening = Date.parse('2026-04-06T02:00:00Z'); // 19:00 Pacific same local day
    expect(dayColorIndex(morning)).toBe(dayColorIndex(evening));
  });
});

describe('localDayBandsInRange', () => {
  it('partitions a 48h window into contiguous per-local-day bands', () => {
    const from = Date.parse('2026-04-05T10:00:00Z'); // 03:00 Apr 5 Pacific
    const to = Date.parse('2026-04-07T10:00:00Z'); // 03:00 Apr 7 Pacific
    const bands = localDayBandsInRange(from, to);
    // 48h starting at 03:00 local Apr 5 spans Apr 5, Apr 6, and Apr 7.
    expect(bands).toHaveLength(3);
    expect(bands[0].dayKey).toBe('2026-04-05');
    expect(bands[1].dayKey).toBe('2026-04-06');
    expect(bands[2].dayKey).toBe('2026-04-07');
    // Endpoints meet.
    expect(bands[0].fromMs).toBe(from);
    expect(bands[0].toMs).toBe(bands[1].fromMs);
    expect(bands[1].toMs).toBe(bands[2].fromMs);
    expect(bands[2].toMs).toBe(to);
    // Consecutive bands get different color indices.
    expect(bands[0].colorIndex).not.toBe(bands[1].colorIndex);
    expect(bands[1].colorIndex).not.toBe(bands[2].colorIndex);
  });

  it('returns a single band when from and to are on the same local day', () => {
    const from = Date.parse('2026-04-05T16:00:00Z'); // 09:00 Pacific
    const to = Date.parse('2026-04-05T23:00:00Z'); // 16:00 Pacific
    const bands = localDayBandsInRange(from, to);
    expect(bands).toHaveLength(1);
    expect(bands[0].dayKey).toBe('2026-04-05');
    expect(bands[0].fromMs).toBe(from);
    expect(bands[0].toMs).toBe(to);
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-04-05T12:00:00Z');
  it.each([
    [now, 'just now'],
    [now - 10_000, '10s ago'],
    [now - 5 * 60_000, '5m ago'],
    [now - 3 * 3600_000, '3h ago'],
    [now - 4 * 86_400_000, '4d ago'],
  ])('%s → %s', (ts, expected) => {
    expect(formatRelative(ts, now)).toBe(expected);
  });
});
