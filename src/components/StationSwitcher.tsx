import type { StationRecord } from '../db/schema';

interface Props {
  stations: StationRecord[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}

export function StationSwitcher({ stations, activeId, onSelect }: Props) {
  return (
    <nav className="station-switcher" aria-label="Pinned stations">
      <ul className="station-switcher__list">
        {stations.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={
                'station-switcher__row' +
                (s.id === activeId ? ' station-switcher__row--active' : '')
              }
              aria-pressed={s.id === activeId}
              onClick={() => onSelect(s.id)}
            >
              {s.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
