/**
 * UV Active Member App — local read cache.
 *
 * Real expo-sqlite, matching the Trainer App's uvactive_trainer.db
 * pattern (see uvactive-trainer-app/src/db/database.ts), rather than
 * AsyncStorage — same reasoning: a proper dev client / EAS build is
 * assumed (see app.json's "expo-sqlite" plugin entry), this won't run
 * inside plain Expo Go.
 *
 * Unlike the Trainer App's db (which is the live source of truth for
 * an in-progress session and writes on every tick), the Member App has
 * nothing that needs offline WRITE support — a member doesn't create
 * data offline, they just read their own profile/session history/
 * bookable list. So this is intentionally a single generic key-value
 * cache table, not a relational schema: whatever the last successful
 * fetch for a given screen returned, stored as JSON, read back
 * instantly on the next screen mount so the UI has something to paint
 * before the network round-trip finishes (or at all, if it's offline).
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'uvactive_member_cache.db';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS cache (
      key        TEXT PRIMARY KEY,
      json       TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return _db;
}

export interface CacheEntry<T> {
  value: T;
  updatedAtMs: number;
}

/** Reads a cached value. Returns null on a cold cache, a corrupt row, or if SQLite itself isn't available (e.g. a dev client without the native module rebuilt yet) — callers always fall back to the network in that case, cache is purely an optimization. */
export async function getCached<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ json: string; updated_at: number }>('SELECT json, updated_at FROM cache WHERE key = ?', [key]);
    if (!row) return null;
    return { value: JSON.parse(row.json) as T, updatedAtMs: row.updated_at };
  } catch {
    return null;
  }
}

/** Writes/overwrites a cached value. Best-effort — a failed cache write must never block or fail the screen that's showing fresh network data regardless. */
export async function setCached<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO cache (key, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
      [key, JSON.stringify(value), Date.now()],
    );
  } catch {
    // Cache is an optimization, not a requirement — swallow.
  }
}
