import { useCallback, useEffect, useMemo, useState } from 'react';
import { bootstrapStationsIfEmpty } from './db/bootstrap';
import {
  getSetting,
  listAllStations,
  listPinnedStations,
  pinStation,
  setSetting,
  unpinStation,
} from './db/tides';
import type { StationRecord } from './db/schema';
import { StationHeader } from './components/StationHeader';
import { StationSwitcher } from './components/StationSwitcher';
import { StationPickerSheet } from './components/StationPickerSheet';
import { TideChart } from './components/TideChart';
import { HiLoStrip } from './components/HiLoStrip';
import { NearMeButton } from './components/NearMeButton';
import { useTheme } from './hooks/useTheme';
import { useTideData } from './hooks/useTideData';
import { syncAllPinned, syncStation, type SyncProgress } from './sync/sync';
import { nightBands } from './lib/sun';
import type { GeoPoint } from './hooks/useGeolocation';

const ACTIVE_STATION_KEY = 'activeStationId';
const LAST_GEO_POINT_KEY = 'lastGeoPoint';

export default function App() {
  const { mode, toggleSun } = useTheme();
  const [booted, setBooted] = useState(false);
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [pinned, setPinned] = useState<StationRecord[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userPoint, setUserPoint] = useState<GeoPoint | undefined>(undefined);

  // Boot: seed IDB, load stations, pick initial active, restore last GPS.
  useEffect(() => {
    void (async () => {
      await bootstrapStationsIfEmpty();
      const [all, pinnedList, savedActive, savedGeo] = await Promise.all([
        listAllStations(),
        listPinnedStations(),
        getSetting<string>(ACTIVE_STATION_KEY),
        getSetting<GeoPoint>(LAST_GEO_POINT_KEY),
      ]);
      setStations(all);
      setPinned(pinnedList);
      setActiveId(savedActive ?? pinnedList[0]?.id);
      if (savedGeo) setUserPoint(savedGeo);
      setBooted(true);
    })();
  }, []);

  // Initial sync on boot, plus sync whenever we come back online.
  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    const run = async () => {
      if (!navigator.onLine) return;
      setSyncing(true);
      await syncAllPinned(Date.now(), (p) => {
        if (!cancelled) setSyncProgress(p);
      });
      if (cancelled) return;
      setSyncProgress(undefined);
      setRefreshToken((t) => t + 1);
      setSyncing(false);
    };
    void run();
    window.addEventListener('online', run);
    return () => {
      cancelled = true;
      window.removeEventListener('online', run);
    };
  }, [booted]);

  // Tick "now" every minute so the now-line and staleness label stay fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const activeStation = useMemo(
    () => stations.find((s) => s.id === activeId),
    [stations, activeId],
  );

  const tide = useTideData({ stationId: activeId, refreshToken, now });

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    void setSetting(ACTIVE_STATION_KEY, id);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!activeId) return;
    setSyncing(true);
    setSyncProgress({ done: 0, total: 1, currentId: activeId });
    await syncStation(activeId, Date.now());
    setSyncProgress(undefined);
    setRefreshToken((t) => t + 1);
    setSyncing(false);
  }, [activeId]);

  // Shared "pin + sync + activate" flow. Used by Near Me (auto-pin the
  // nearest station if it isn't already) and the Add Station sheet (user
  // explicitly picks one). A failed sync leaves the pin in place so the
  // station will resync next time the app is online.
  const pinSyncAndActivate = useCallback(
    async (stationId: string) => {
      const target = stations.find((s) => s.id === stationId);
      if (!target) return;
      if (!target.pinned) {
        await pinStation(stationId);
        const [all, pinnedList] = await Promise.all([
          listAllStations(),
          listPinnedStations(),
        ]);
        setStations(all);
        setPinned(pinnedList);
        setSyncing(true);
        setSyncProgress({
          done: 0,
          total: 1,
          currentId: stationId,
          currentName: target.name,
        });
        await syncStation(stationId, Date.now());
        setSyncProgress(undefined);
        setSyncing(false);
      }
      setActiveId(stationId);
      void setSetting(ACTIVE_STATION_KEY, stationId);
      setRefreshToken((t) => t + 1);
    },
    [stations],
  );

  const handleNearMePick = useCallback(
    (id: string, point: GeoPoint) => {
      // Persist the GPS fix so distance labels survive page reloads and
      // show even before the user taps Near Me in a future session.
      setUserPoint(point);
      void setSetting(LAST_GEO_POINT_KEY, point);
      void pinSyncAndActivate(id);
    },
    [pinSyncAndActivate],
  );

  const handlePinFromSheet = useCallback(
    (id: string) => {
      setPickerOpen(false);
      void pinSyncAndActivate(id);
    },
    [pinSyncAndActivate],
  );

  const handleUnpin = useCallback(
    async (id: string) => {
      if (pinned.length <= 1) return;
      await unpinStation(id);
      const [all, pinnedList] = await Promise.all([
        listAllStations(),
        listPinnedStations(),
      ]);
      setStations(all);
      setPinned(pinnedList);
      // If the user just unpinned the station they were looking at,
      // re-home to the first remaining pinned station rather than
      // dumping them onto the empty state.
      if (id === activeId) {
        const next = pinnedList[0]?.id;
        if (next) {
          setActiveId(next);
          void setSetting(ACTIVE_STATION_KEY, next);
          setRefreshToken((t) => t + 1);
        }
      }
    },
    [pinned, activeId],
  );

  const bands = useMemo(() => {
    if (tide.state !== 'ready' || !activeStation) return [];
    return nightBands(tide.data.fromMs, tide.data.toMs, activeStation.lat, activeStation.lon);
  }, [tide, activeStation]);

  if (!booted || !activeStation) {
    return <div className="app"><p>Loading…</p></div>;
  }

  return (
    <div className="app">
      <StationHeader
        station={activeStation}
        lastSyncedAt={tide.state === 'ready' ? tide.data.lastSyncedAt : undefined}
        cacheStats={tide.state === 'ready' ? tide.data.cacheStats : undefined}
        syncProgress={syncProgress}
        isSun={mode === 'sun'}
        onToggleSun={toggleSun}
        onRefresh={handleRefresh}
        syncing={syncing}
        userPoint={userPoint}
      />

      {tide.state === 'loading' && <p className="placeholder">Loading tide data…</p>}

      {tide.state === 'empty' && (
        <p className="placeholder">
          No tide data cached for this station yet.{' '}
          {navigator.onLine ? 'Tap Refresh to fetch.' : 'Connect to the internet and refresh.'}
        </p>
      )}

      {tide.state === 'ready' && (
        <>
          <TideChart
            points={tide.data.points}
            hiLo={tide.data.hiLo}
            nowMs={now}
            nightBands={bands}
            fromMs={tide.data.fromMs}
            toMs={tide.data.toMs}
          />
          <HiLoStrip events={tide.data.hiLo} nowMs={now} />
        </>
      )}

      <div className="app__near-me">
        <NearMeButton
          stations={stations}
          onPick={handleNearMePick}
        />
      </div>

      <StationSwitcher
        stations={pinned}
        activeId={activeId}
        onSelect={handleSelect}
        onUnpin={handleUnpin}
        onAdd={() => setPickerOpen(true)}
        userPoint={userPoint}
      />

      {pickerOpen && (
        <StationPickerSheet
          candidates={stations.filter((s) => !s.pinned)}
          onPin={handlePinFromSheet}
          onClose={() => setPickerOpen(false)}
          userPoint={userPoint}
        />
      )}
    </div>
  );
}
