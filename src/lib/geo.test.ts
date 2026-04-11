import { describe, expect, it } from 'vitest';
import { haversineKm, nearestStation } from './geo';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: 48.42, lon: -123.37 }, { lat: 48.42, lon: -123.37 })).toBe(0);
  });

  it('matches known distance between Victoria and Tofino (~210 km)', () => {
    const victoria = { lat: 48.424, lon: -123.371 };
    const tofino = { lat: 49.154, lon: -125.913 };
    const d = haversineKm(victoria, tofino);
    expect(d).toBeGreaterThan(195);
    expect(d).toBeLessThan(220);
  });
});

describe('nearestStation', () => {
  const stations = [
    { id: 'vic', lat: 48.424, lon: -123.371 },
    { id: 'tof', lat: 49.154, lon: -125.913 },
    { id: 'phy', lat: 50.722, lon: -127.489 },
  ];

  it('picks Victoria when near downtown Victoria', () => {
    const r = nearestStation({ lat: 48.43, lon: -123.37 }, stations);
    expect(r?.station.id).toBe('vic');
    expect(r?.distanceKm).toBeLessThan(5);
  });

  it('picks Port Hardy when near the north tip', () => {
    const r = nearestStation({ lat: 50.72, lon: -127.5 }, stations);
    expect(r?.station.id).toBe('phy');
  });

  it('returns null for an empty list', () => {
    expect(nearestStation({ lat: 0, lon: 0 }, [])).toBeNull();
  });

  it('returns the haversine distance to the chosen station', () => {
    const r = nearestStation({ lat: 49.154, lon: -125.913 }, stations);
    expect(r?.station.id).toBe('tof');
    expect(r?.distanceKm).toBeLessThan(0.1);
  });
});
