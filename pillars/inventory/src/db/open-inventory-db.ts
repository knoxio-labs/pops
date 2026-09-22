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

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import { rebuildSearchIndexFromItems } from './backfill-search-index.js';
import { registerPersistedItemTypesMigrationFunctions } from './migrations/persisted-item-types-bootstrap.js';

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

/**
 * Whether `items_fts` is missing rows for live `items` after migrations have
 * just applied (POPS-4158). Checked fresh on every boot, from the tables'
 * own row counts, rather than from whether `0015_items_fts_trigram` was
 * pending this run: that migration's DROP+CREATE and the JS backfill that
 * repopulates it from `items` are two separate steps with no shared
 * transaction, so a boot that is killed (OOM, preemption, a bad row throwing
 * mid-`rebuildSearchIndexFromItems`) between them commits `0015` — and its
 * `__drizzle_migrations` row — while leaving `items_fts` empty or partial.
 * On the next boot `0015` is no longer pending, so a decision made only from
 * pending migrations would skip the backfill forever. Comparing row counts
 * instead re-detects the gap on every subsequent boot until it closes, and
 * costs one extra `count(*)` pair when it is already closed.
 */
function searchIndexIncomplete(raw: Database.Database): boolean {
  const itemsCount = raw.prepare('SELECT count(*) AS n FROM items').get() as { n: number };
  const ftsCount = raw.prepare('SELECT count(*) AS n FROM items_fts').get() as { n: number };
  return itemsCount.n !== ftsCount.n;
}

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
 *   - Once migrations have applied, `items_fts` is rebuilt from every row in
 *     `items` whenever its row count disagrees with `items`' — whether
 *     because `0015_items_fts_trigram` just recreated it empty, or because
 *     an earlier boot committed that migration and was killed before
 *     finishing the rebuild (POPS-4158; see {@link searchIndexIncomplete}).
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
  registerPersistedItemTypesMigrationFunctions(raw);
  const db = drizzle(raw) as InventoryDb;
  const migrations = migrationsDir();
  try {
    withPreMigrationBackup(
      { connection: raw, databasePath: path, migrationsFolder: migrations },
      () => migrate(db, { migrationsFolder: migrations })
    );
    if (searchIndexIncomplete(raw)) rebuildSearchIndexFromItems(db);
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
