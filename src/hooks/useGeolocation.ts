import { useCallback, useState } from 'react';

export interface GeoPoint {
  lat: number;
  lon: number;
  accuracy: number;
}

export interface GeoState {
  status: 'idle' | 'pending' | 'ok' | 'error';
  point?: GeoPoint;
  error?: string;
}

export function useGeolocation(): {
  state: GeoState;
  request: () => void;
} {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', error: 'Geolocation unsupported' });
      return;
    }
    setState({ status: 'pending' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'ok',
          point: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
      },
      (err) => setState({ status: 'error', error: err.message }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  }, []);

  return { state, request };
}
