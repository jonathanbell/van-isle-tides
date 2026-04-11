import type { StationRecord } from '../db/schema';
import type { StationCacheStats } from '../db/tides';
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
}: Props) {
  const stale = isStale(lastSyncedAt);
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
        </span>
        <button type="button" onClick={onRefresh} disabled={syncing} className="station-header__refresh">
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>
      {cacheStats && cacheStats.totalPoints > 0 && (
        <div className="station-header__stats" aria-label="Cache summary">
          {cacheStats.totalPoints.toLocaleString()} pts · {cacheStats.dayBuckets} day{cacheStats.dayBuckets === 1 ? '' : 's'}
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
