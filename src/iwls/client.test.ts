import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHiLo, getPredictions, IWLS_BASE, listStations } from './client';

const originalFetch = globalThis.fetch;

function mockFetchOnce(body: unknown, init: ResponseInit = { status: 200 }) {
  const fn = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), init),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('listStations', () => {
  it('builds the URL with optional code filter and normalizes the response', async () => {
    const fn = mockFetchOnce([
      {
        id: 'abc',
        code: '07120',
        officialName: 'Victoria Harbour',
        latitude: 48.4,
        longitude: -123.4,
        timeSeries: [{ code: 'wlp' }, { code: 'wlp-hilo' }],
      },
    ]);

    const result = await listStations({ code: '07120' });

    expect(fn).toHaveBeenCalledOnce();
    const url = String(fn.mock.calls[0][0]);
    expect(url).toBe(`${IWLS_BASE}/stations?code=07120`);

    expect(result).toEqual([
      {
        id: 'abc',
        code: '07120',
        name: 'Victoria Harbour',
        lat: 48.4,
        lon: -123.4,
        timeSeries: ['wlp', 'wlp-hilo'],
      },
    ]);
  });
});

describe('getPredictions', () => {
  it('hits /data with the wlp time-series + FIFTEEN_MINUTES resolution', async () => {
    const fn = mockFetchOnce([
      { eventDate: '2026-04-05T00:00:00Z', value: 1.5 },
      { eventDate: '2026-04-05T00:15:00Z', value: 1.8 },
      { eventDate: '2026-04-05T00:30:00Z', value: Number.NaN }, // filtered
    ]);

    const points = await getPredictions('abc', '2026-04-05T00:00:00Z', '2026-04-06T00:00:00Z');

    const url = String(fn.mock.calls[0][0]);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/stations/abc/data');
    expect(parsed.searchParams.get('time-series-code')).toBe('wlp');
    expect(parsed.searchParams.get('resolution')).toBe('FIFTEEN_MINUTES');
    expect(parsed.searchParams.get('from')).toBe('2026-04-05T00:00:00Z');
    expect(parsed.searchParams.get('to')).toBe('2026-04-06T00:00:00Z');

    expect(points).toEqual([
      { t: Date.parse('2026-04-05T00:00:00Z'), v: 1.5 },
      { t: Date.parse('2026-04-05T00:15:00Z'), v: 1.8 },
    ]);
  });

  it('throws a tagged error with the HTTP status on failure', async () => {
    mockFetchOnce({}, { status: 503 });
    await expect(
      getPredictions('abc', '2026-04-05T00:00:00Z', '2026-04-06T00:00:00Z'),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe('getHiLo', () => {
  it('infers HIGH/LOW from neighbours when eventType is missing', async () => {
    mockFetchOnce([
      { eventDate: '2026-04-05T06:00:00Z', value: 2.9 },
      { eventDate: '2026-04-05T12:00:00Z', value: 0.3 },
      { eventDate: '2026-04-05T18:00:00Z', value: 3.1 },
    ]);

    const events = await getHiLo('abc', '2026-04-05T00:00:00Z', '2026-04-06T00:00:00Z');
    expect(events.map((e) => e.type)).toEqual(['HIGH', 'LOW', 'HIGH']);
  });

  it('respects explicit eventType when provided', async () => {
    mockFetchOnce([
      { eventDate: '2026-04-05T06:00:00Z', value: 2.9, eventType: 'high' },
      { eventDate: '2026-04-05T12:00:00Z', value: 0.3, eventType: 'low' },
    ]);
    const events = await getHiLo('abc', 'a', 'b');
    expect(events.map((e) => e.type)).toEqual(['HIGH', 'LOW']);
  });
});
