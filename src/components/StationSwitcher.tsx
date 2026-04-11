import type { StationRecord } from '../db/schema';
import type { GeoPoint } from '../hooks/useGeolocation';
import { formatKm, haversineKm } from '../lib/geo';

interface Props {
  stations: StationRecord[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onUnpin: (id: string) => void;
  onAdd: () => void;
  userPoint?: GeoPoint;
}

export function StationSwitcher({
  stations,
  activeId,
  onSelect,
  onUnpin,
  onAdd,
  userPoint,
}: Props) {
  // Guard: never let the user unpin the last remaining station — they'd
  // be left with nothing to look at and no obvious recovery path.
  const canUnpin = stations.length > 1;
  return (
    <nav className="station-switcher" aria-label="Pinned stations">
      <ul className="station-switcher__list">
        {stations.map((s) => {
          const isActive = s.id === activeId;
          const distKm = userPoint
            ? haversineKm(userPoint, { lat: s.lat, lon: s.lon })
            : undefined;
          return (
            <li key={s.id} className="station-switcher__item">
              <button
                type="button"
                className={
                  'station-switcher__row' +
                  (isActive ? ' station-switcher__row--active' : '')
                }
                aria-pressed={isActive}
                onClick={() => onSelect(s.id)}
              >
                <span className="station-switcher__name">{s.name}</span>
                {distKm !== undefined && (
                  <span className="station-switcher__distance">{formatKm(distKm)}</span>
                )}
              </button>
              {canUnpin && (
                <button
                  type="button"
                  className="station-switcher__unpin"
                  aria-label={`Unpin ${s.name}`}
                  title={`Unpin ${s.name}`}
                  onClick={() => onUnpin(s.id)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="station-switcher__add"
        onClick={onAdd}
      >
        + Add station
      </button>
    </nav>
  );
}
