/**
 * Time helpers. Internal representation is always UTC epoch ms.
 * Local formatting uses America/Vancouver (DST-aware) via Intl.
 */

export const VAN_ISLE_TZ = 'America/Vancouver';

/** UTC 'YYYY-MM-DD' bucket for IndexedDB keying. MUST be UTC, not local. */
export function dayBucket(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Epoch ms of the start (00:00:00 UTC) of the UTC day containing epochMs. */
export function startOfUtcDay(epochMs: number): number {
  const d = new Date(epochMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Add UTC days to a timestamp (no DST gotchas because UTC has no DST). */
export function addUtcDays(epochMs: number, days: number): number {
  return epochMs + days * 86_400_000;
}

/** ISO 8601 UTC with trailing Z, which IWLS requires. */
export function toIwlsIso(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const hmFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VAN_ISLE_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VAN_ISLE_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// en-CA with numeric year/month/day reliably produces 'YYYY-MM-DD'. We use
// this as a stable key for "the same local day" across the app.
const localDayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VAN_ISLE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatLocalTime(epochMs: number): string {
  return hmFormatter.format(epochMs);
}

export function formatLocalDate(epochMs: number): string {
  return dayFormatter.format(epochMs);
}

/** "Sat, Apr 11, 19:40" — used by the tide-chart hover tooltip. */
export function formatLocalDateTime(epochMs: number): string {
  return `${dayFormatter.format(epochMs)}, ${hmFormatter.format(epochMs)}`;
}

/**
 * 'YYYY-MM-DD' in America/Vancouver — groups timestamps the user perceives
 * as "the same day" (unlike dayBucket() which is UTC for storage keys).
 * Uses formatToParts so we don't depend on en-CA producing ISO-style
 * output with a dash separator (browser Intl implementations vary).
 */
export function localDayKey(epochMs: number): string {
  const parts = localDayKeyFormatter.formatToParts(epochMs);
  let y = '';
  let m = '';
  let d = '';
  for (const p of parts) {
    if (p.type === 'year') y = p.value;
    else if (p.type === 'month') m = p.value;
    else if (p.type === 'day') d = p.value;
  }
  return `${y}-${m}-${d}`;
}

function dayColorIndexFromKey(key: string, buckets: number): number {
  // Use the local date's days-since-epoch so consecutive days always get
  // different indices (a simple hash can collide on adjacent days).
  const [y, m, d] = key.split('-').map(Number);
  const daysSinceEpoch = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return ((daysSinceEpoch % buckets) + buckets) % buckets;
}

/**
 * Deterministic 0..(buckets-1) index for the local day of `epochMs`.
 * Consecutive local days always get different indices. Used to match
 * hi/lo card tints with tide-chart day backgrounds.
 */
export function dayColorIndex(epochMs: number, buckets: number = 3): number {
  return dayColorIndexFromKey(localDayKey(epochMs), buckets);
}

export interface LocalDayBand {
  fromMs: number;
  toMs: number;
  dayKey: string;
  colorIndex: number;
}

/**
 * Partition [fromMs, toMs] into contiguous bands, one per local
 * (America/Vancouver) day. Used by TideChart to paint day backgrounds.
 * Robust to DST transitions — we locate boundaries by bisection on
 * localDayKey() rather than doing timezone arithmetic by hand.
 */
export function localDayBandsInRange(
  fromMs: number,
  toMs: number,
  buckets: number = 3,
): LocalDayBand[] {
  if (toMs <= fromMs) return [];
  const bands: LocalDayBand[] = [];
  const STEP = 15 * 60 * 1000;
  let bandStart = fromMs;
  let currentKey = localDayKey(bandStart);
  for (let t = fromMs + STEP; t < toMs; t += STEP) {
    const key = localDayKey(t);
    if (key === currentKey) continue;
    // Boundary is in (t-STEP, t]. Bisect down to the minute.
    let lo = t - STEP;
    let hi = t;
    while (hi - lo > 60_000) {
      const mid = (lo + hi) >> 1;
      if (localDayKey(mid) === currentKey) lo = mid;
      else hi = mid;
    }
    bands.push({
      fromMs: bandStart,
      toMs: hi,
      dayKey: currentKey,
      colorIndex: dayColorIndexFromKey(currentKey, buckets),
    });
    bandStart = hi;
    currentKey = key;
  }
  bands.push({
    fromMs: bandStart,
    toMs,
    dayKey: currentKey,
    colorIndex: dayColorIndexFromKey(currentKey, buckets),
  });
  return bands;
}

export function formatRelative(epochMs: number, now: number = Date.now()): string {
  const diff = now - epochMs;
  if (diff < 1000) return 'just now';
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
