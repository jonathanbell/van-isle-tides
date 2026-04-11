/** Haversine distance (km) between two WGS-84 coordinates. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Human-friendly km formatter. Sub-km → metres, 1–10 km → 1 decimal,
 * ≥10 km → whole km. Used anywhere the UI shows distance from the user.
 */
export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export interface NearestStationResult<T> {
  station: T;
  distanceKm: number;
}

export function nearestStation<T extends { lat: number; lon: number }>(
  point: { lat: number; lon: number },
  stations: T[],
): NearestStationResult<T> | null {
  if (!stations.length) return null;
  let best = stations[0];
  let bestD = haversineKm(point, best);
  for (let i = 1; i < stations.length; i++) {
    const d = haversineKm(point, stations[i]);
    if (d < bestD) {
      best = stations[i];
      bestD = d;
    }
  }
  return { station: best, distanceKm: bestD };
}
