/**
 * Thin client for the Canadian Hydrographic Service IWLS API.
 *
 * Base URL is kept in a single constant so it can be swapped for a proxy
 * if DFO ever tightens CORS (see plan's "CORS escape hatch" note).
 */
import { iwlsQueue, type HttpError } from './queue';

export const IWLS_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';

export interface IwlsTimeSeries {
  code: string;
  nameEn?: string;
}

export interface IwlsStationRaw {
  id: string;
  code: string;
  officialName: string;
  latitude: number;
  longitude: number;
  operating?: boolean;
  timeSeries?: IwlsTimeSeries[];
}

export interface IwlsStation {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  timeSeries: string[];
}

export interface TidePoint {
  /** epoch ms (UTC) */
  t: number;
  /** metres */
  v: number;
}

export type HiLoType = 'HIGH' | 'LOW';

export interface HiLoEvent {
  t: number;
  v: number;
  type: HiLoType;
}

interface IwlsDataPointRaw {
  eventDate: string;
  value: number;
  qcFlagCode?: string;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function listStations(filter?: { code?: string }): Promise<IwlsStation[]> {
  const qs = filter?.code ? `?code=${encodeURIComponent(filter.code)}` : '';
  const raw = await request<IwlsStationRaw[]>(`/stations${qs}`);
  return raw.map(normalizeStation);
}

export async function getPredictions(
  stationId: string,
  fromISO: string,
  toISO: string,
): Promise<TidePoint[]> {
  const params = new URLSearchParams({
    'time-series-code': 'wlp',
    from: fromISO,
    to: toISO,
    resolution: 'FIFTEEN_MINUTES',
  });
  const raw = await request<IwlsDataPointRaw[]>(
    `/stations/${encodeURIComponent(stationId)}/data?${params.toString()}`,
  );
  return raw
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ t: Date.parse(p.eventDate), v: p.value }));
}

export async function getHiLo(
  stationId: string,
  fromISO: string,
  toISO: string,
): Promise<HiLoEvent[]> {
  const params = new URLSearchParams({
    'time-series-code': 'wlp-hilo',
    from: fromISO,
    to: toISO,
  });
  const raw = await request<(IwlsDataPointRaw & { eventType?: string })[]>(
    `/stations/${encodeURIComponent(stationId)}/data?${params.toString()}`,
  );
  const events: HiLoEvent[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!Number.isFinite(p.value)) continue;
    const explicit = p.eventType?.toUpperCase();
    const type: HiLoType =
      explicit === 'HIGH' || explicit === 'LOW'
        ? (explicit as HiLoType)
        : inferHiLoType(raw, i);
    events.push({ t: Date.parse(p.eventDate), v: p.value, type });
  }
  return events;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeStation(s: IwlsStationRaw): IwlsStation {
  return {
    id: s.id,
    code: s.code,
    name: s.officialName,
    lat: s.latitude,
    lon: s.longitude,
    timeSeries: s.timeSeries?.map((t) => t.code) ?? [],
  };
}

/** IWLS wlp-hilo has historically omitted eventType; infer from neighbours. */
function inferHiLoType(points: IwlsDataPointRaw[], i: number): HiLoType {
  const prev = points[i - 1];
  const next = points[i + 1];
  const v = points[i].value;
  if (prev && next) return v > (prev.value + next.value) / 2 ? 'HIGH' : 'LOW';
  if (prev) return v > prev.value ? 'HIGH' : 'LOW';
  if (next) return v > next.value ? 'HIGH' : 'LOW';
  return 'HIGH';
}

async function request<T>(path: string): Promise<T> {
  return iwlsQueue.run(async (signal) => {
    const res = await fetch(`${IWLS_BASE}${path}`, {
      signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      const err: HttpError = new Error(`IWLS ${res.status} ${res.statusText}: ${path}`);
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}
