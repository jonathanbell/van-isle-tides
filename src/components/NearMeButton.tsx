import { useEffect, useRef } from 'react';
import { useGeolocation, type GeoPoint } from '../hooks/useGeolocation';
import type { StationRecord } from '../db/schema';
import { nearestStation } from '../lib/geo';

interface Props {
  stations: StationRecord[];
  onPick: (stationId: string, point: GeoPoint) => void;
}

export function NearMeButton({ stations, onPick }: Props) {
  const { state, request } = useGeolocation();
  // Only dispatch each GPS fix once. Without this, any parent re-render
  // (e.g. the 60s "now" tick) re-runs the effect and snaps the active
  // station back to the nearest one, clobbering manual switcher picks.
  const consumedPointRef = useRef<GeoPoint | undefined>(undefined);

  useEffect(() => {
    if (state.status !== 'ok' || !state.point || !stations.length) return;
    if (consumedPointRef.current === state.point) return;
    consumedPointRef.current = state.point;
    const near = nearestStation(state.point, stations);
    if (near) onPick(near.id, state.point);
  }, [state, stations, onPick]);

  const label =
    state.status === 'pending'
      ? 'Locating…'
      : state.status === 'error'
        ? 'Retry GPS'
        : 'Near me';

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
