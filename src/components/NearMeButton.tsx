import { useEffect, useRef, useState } from 'react';
import { useGeolocation, type GeoPoint } from '../hooks/useGeolocation';
import type { StationRecord } from '../db/schema';
import { formatKm, nearestStation } from '../lib/geo';

interface Props {
  stations: StationRecord[];
  onPick: (stationId: string, point: GeoPoint) => void;
}

/**
 * If the nearest station is further than this, we surface it in the
 * button label so the user knows the match may not be very "near" —
 * the catalog is a hand-picked Van-Isle subset, not every IWLS station
 * in Canada, so a user well outside Van Isle will get a misleading pick
 * otherwise.
 */
const DISTANT_THRESHOLD_KM = 25;

export function NearMeButton({ stations, onPick }: Props) {
  const { state, request } = useGeolocation();
  const consumedPointRef = useRef<GeoPoint | undefined>(undefined);
  const [lastPick, setLastPick] = useState<
    { name: string; distanceKm: number } | undefined
  >(undefined);

  useEffect(() => {
    if (state.status !== 'ok' || !state.point || !stations.length) return;
    if (consumedPointRef.current === state.point) return;
    consumedPointRef.current = state.point;
    const near = nearestStation(state.point, stations);
    if (near) {
      setLastPick({ name: near.station.name, distanceKm: near.distanceKm });
      onPick(near.station.id, state.point);
    }
  }, [state, stations, onPick]);

  let label: string;
  if (state.status === 'pending') {
    label = 'Locating…';
  } else if (state.status === 'error') {
    label = 'Retry GPS';
  } else if (lastPick) {
    // Once we've made a pick, show the station name + distance so the
    // user can tell whether the catalog had a sensible match nearby.
    const dist = formatKm(lastPick.distanceKm);
    label =
      lastPick.distanceKm > DISTANT_THRESHOLD_KM
        ? `Nearest: ${lastPick.name} (${dist} away)`
        : `Near me · ${lastPick.name} · ${dist}`;
  } else {
    label = 'Near me';
  }

  return (
    <button
      type="button"
      className="near-me"
      onClick={request}
      disabled={state.status === 'pending'}
      title={state.status === 'error' ? state.error : undefined}
    >
      {label}
    </button>
  );
}
