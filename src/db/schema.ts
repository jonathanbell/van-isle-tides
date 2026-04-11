import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TidePoint } from '../iwls/client';

export interface StationRecord {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  pinned: boolean;
  pinOrder: number;
  timeSeries: string[];
}

export interface PredictionRecord {
  stationId: string;
  dayBucket: string;
  points: TidePoint[];
  fetchedAt: number;
}

export interface SyncMetaRecord {
  stationId: string;
  lastSyncedAt: number;
  rangeFromMs: number;
  rangeToMs: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface VitDB extends DBSchema {
  stations: {
    key: string;
    value: StationRecord;
    indexes: { 'by-code': string; 'by-pinned': [number, number] };
  };
  predictions: {
    key: [string, string];
    value: PredictionRecord;
    indexes: { 'by-station': string };
  };
  syncMeta: {
    key: string;
    value: SyncMetaRecord;
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
}

const DB_NAME = 'vit';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VitDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<VitDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VitDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const stations = db.createObjectStore('stations', { keyPath: 'id' });
        stations.createIndex('by-code', 'code', { unique: false });
        stations.createIndex('by-pinned', ['pinned', 'pinOrder'], { unique: false });

        const predictions = db.createObjectStore('predictions', {
          keyPath: ['stationId', 'dayBucket'],
        });
        predictions.createIndex('by-station', 'stationId', { unique: false });

        db.createObjectStore('syncMeta', { keyPath: 'stationId' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

/** Test helper: close any open connection and delete the database. */
export async function __resetDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
