import type { StationRecord } from '../db/schema';
import type { StationCacheStats } from '../db/tides';
import type { GeoPoint } from '../hooks/useGeolocation';
import { formatKm, haversineKm } from '../lib/geo';
import { formatLocalDate, formatRelative } from '../lib/time';
import { isStale, type SyncProgress } from '../sync/sync';
import { SunModeToggle } from './SunModeToggle';

interface Props {
  station: StationRecord;
  lastSyncedAt?: number;
  cacheStats?: StationCacheStats;
  syncProgress?: SyncProgress;
  isSun: boolean;
  onToggleSun: () => void;
  onRefresh: () => void;
  syncing: boolean;
  userPoint?: GeoPoint;
}

export function StationHeader({
  station,
  lastSyncedAt,
  cacheStats,
  syncProgress,
  isSun,
  onToggleSun,
  onRefresh,
  syncing,
  userPoint,
}: Props) {
  const stale = isStale(lastSyncedAt);
  const distanceKm = userPoint
    ? haversineKm(userPoint, { lat: station.lat, lon: station.lon })
    : undefined;
  const bulkSyncing = syncing && syncProgress && syncProgress.total > 1 && syncProgress.done < syncProgress.total;
  return (
    <header className="station-header">
      <div className="station-header__row">
        <h1 className="station-header__name">{station.name}</h1>
        <SunModeToggle isSun={isSun} onToggle={onToggleSun} />
      </div>
      <div className="station-header__row station-header__row--meta">
        <span className="station-header__sync">
          {bulkSyncing
            ? `Syncing ${syncProgress!.done + 1}/${syncProgress!.total}${syncProgress!.currentName ? ` — ${syncProgress!.currentName}` : ''}…`
            : syncing
              ? 'Syncing…'
              : lastSyncedAt
                ? `synced ${formatRelative(lastSyncedAt)}`
                : 'never synced'}
          {distanceKm !== undefined && ` · ${formatKm(distanceKm)} away`}
        </span>
        <button type="button" onClick={onRefresh} disabled={syncing} className="station-header__refresh">
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>
      {cacheStats && cacheStats.totalPoints > 0 && (
        <div className="station-header__stats" aria-label="Cache summary">
          {cacheStats.totalPoints.toLocaleString()} data points · {cacheStats.dayBuckets} day{cacheStats.dayBuckets === 1 ? '' : 's'}
          {cacheStats.lastPointMs ? ` · through ${formatLocalDate(cacheStats.lastPointMs)}` : ''}
        </div>
      )}
      {stale && (
        <div className="station-header__stale" role="status">
          Cache is more than 14 days old — reconnect and refresh when you can.
        </div>
      )}
    </header>
  );
}
