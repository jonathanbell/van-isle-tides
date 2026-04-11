import SunCalc from 'suncalc';
import { addUtcDays, startOfUtcDay } from './time';

export interface NightBand {
  /** Sunset epoch ms (start of the shaded night band). */
  from: number;
  /** Next sunrise epoch ms (end of the night band). */
  to: number;
}

/**
 * Compute night shading bands (sunset → next sunrise) that overlap [fromMs, toMs]
 * for a given station coordinate. One band per calendar day; we widen the
 * search by one day on each side to cover partial overlaps at the edges.
 */
export function nightBands(
  fromMs: number,
  toMs: number,
  lat: number,
  lon: number,
): NightBand[] {
  const bands: NightBand[] = [];
  const start = addUtcDays(startOfUtcDay(fromMs), -1);
  const end = addUtcDays(startOfUtcDay(toMs), 1);
  for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
    const today = SunCalc.getTimes(new Date(cursor), lat, lon);
    const tomorrow = SunCalc.getTimes(new Date(addUtcDays(cursor, 1)), lat, lon);
    if (!today.sunset || !tomorrow.sunrise) continue;
    const band: NightBand = {
      from: today.sunset.getTime(),
      to: tomorrow.sunrise.getTime(),
    };
    if (band.to < fromMs || band.from > toMs) continue;
    bands.push(band);
  }
  return bands;
}
