/**
 * Standalone opener for the inventory pillar's SQLite database.
 *
 * Intentionally minimal — it relies on drizzle-orm's built-in `migrate`
 * helper to apply the in-package migrations journal at
 * `pillars/inventory/migrations/meta/_journal.json`.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { pendingMigrations, withPreMigrationBackup } from '@pops/pillar-sdk/db';

import { rebuildSearchIndexFromItems } from './backfill-search-index.js';

import type { InventoryDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this package. Resolved relative
 * to this module's location (`src/db/open-inventory-db.ts` in dev,
 * `dist/db/open-inventory-db.js` after build) so it works both when
 * consumed via the workspace symlink and when bundled into a Docker
 * image's `node_modules/@pops/inventory/`.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/** Result of {@link openInventoryDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides). */
export interface OpenedInventoryDb {
  /** Drizzle handle — pass into any `locationsService.*` call. */
  db: InventoryDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/** The journal tag `0015_items_fts_trigram` recreates `items_fts` empty (POPS-4158). */
const ITEMS_FTS_TRIGRAM_TAG = '0015_items_fts_trigram';

/**
 * Open the inventory pillar's SQLite database at `path`, configure
 * it, apply the in-package migrations journal, and return both the
 * drizzle wrapper and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000`
 *     are enabled.
 *   - Every migration in
 *     `pillars/inventory/migrations/meta/_journal.json` is applied
 *     via drizzle's built-in migrator (idempotent — re-running against
 *     the same DB compares each entry's recorded timestamp, not its SQL,
 *     so an already-applied entry is never re-run even if its file changes
 *     afterwards).
 *   - If `${ITEMS_FTS_TRIGRAM_TAG}` was still pending before the migrate
 *     call above, `items_fts` was just dropped and recreated empty, so it is
 *     rebuilt from every row in `items` right after (POPS-4158).
 *
 * If the migration apply throws (corrupt DB, malformed migration,
 * missing folder), the raw handle is closed before the error is
 * re-thrown so the caller can't leak a locked file descriptor.
 *
 * The apply runs behind `withPreMigrationBackup`: a snapshot is taken
 * first whenever this database has journal entries left to apply AND
 * already carries a schema of its own, removed once they all land, and
 * left on disk with its path logged when one throws. A database being
 * created here — the first-ever mount of the data volume — has nothing
 * to snapshot and is migrated directly.
 */
export function openInventoryDb(path: string): OpenedInventoryDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as InventoryDb;
  const migrations = migrationsDir();
  const rebuildsSearchIndex = pendingMigrations(raw, migrations).some(
    (entry) => entry.tag === ITEMS_FTS_TRIGRAM_TAG
  );
  try {
    withPreMigrationBackup(
      { connection: raw, databasePath: path, migrationsFolder: migrations },
      () => migrate(db, { migrationsFolder: migrations })
    );
    if (rebuildsSearchIndex) rebuildSearchIndexFromItems(db);
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
