import { useEffect, useMemo } from 'react';
import type { StationRecord } from '../db/schema';
import type { GeoPoint } from '../hooks/useGeolocation';
import { formatKm, haversineKm } from '../lib/geo';

interface Props {
  /** Candidate stations — should already be filtered to unpinned only. */
  candidates: StationRecord[];
  onPin: (id: string) => void;
  onClose: () => void;
  userPoint?: GeoPoint;
}

/**
 * Modal sheet that lists unpinned stations so the user can add them to
 * the pinned switcher. When we have a persisted GPS fix we sort nearest
 * first (and show the distance) — otherwise fall back to alphabetical
 * for predictable scanning.
 */
export function StationPickerSheet({ candidates, onPin, onClose, userPoint }: Props) {
  const sorted = useMemo(() => {
    if (!userPoint) {
      return [...candidates]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ station: s, distanceKm: undefined as number | undefined }));
    }
    return [...candidates]
      .map((s) => ({
        station: s,
        distanceKm: haversineKm(userPoint, { lat: s.lat, lon: s.lon }),
      }))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [candidates, userPoint]);

  // Esc to dismiss — matches native modal expectations.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add station"
      >
        <div className="sheet__header">
          <h2 className="sheet__title">Add station</h2>
          <button
            type="button"
            className="sheet__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="sheet__empty">All available stations are already pinned.</p>
        ) : (
          <ul className="sheet__list">
            {sorted.map(({ station, distanceKm }) => (
              <li key={station.id}>
                <button
                  type="button"
                  className="sheet__row"
                  onClick={() => onPin(station.id)}
                >
                  <span className="sheet__row-name">{station.name}</span>
                  {distanceKm !== undefined && (
                    <span className="sheet__row-distance">{formatKm(distanceKm)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
