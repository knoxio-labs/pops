/**
 * Standalone opener for the media pillar's SQLite database.
 *
 * Intentionally minimal — it does NOT load the sqlite-vec extension or the
 * vector-index helpers, and relies on drizzle-orm's built-in `migrate`
 * helper to apply the in-pillar migrations journal at
 * `migrations/meta/_journal.json`.
 *
 * Follows the standard per-pillar database-opener pattern.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import type { MediaDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this pillar. Resolved relative to
 * this module's location (`src/db/open-media-db.ts` in dev,
 * `dist/db/open-media-db.js` after build) so it works both when run from
 * source and when bundled into the pillar's Docker image (`dist/` + a
 * sibling `migrations/`).
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/** Result of {@link openMediaDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides). */
export interface OpenedMediaDb {
  /** Drizzle handle — pass into any `shelfImpressionsService.*` call. */
  db: MediaDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the media pillar's SQLite database at `path`, configure it, apply
 * the in-package migrations journal, and return both the drizzle wrapper
 * and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000` are
 *     enabled.
 *   - Every migration in `migrations/meta/_journal.json` is applied via
 *     drizzle's built-in migrator (idempotent — re-running against the same
 *     DB short-circuits on the `__drizzle_migrations` hash check).
 *
 * If the migration apply throws (corrupt DB, malformed migration, missing
 * folder), the raw handle is closed before the error is re-thrown so the
 * caller can't leak a locked file descriptor.
 *
 * The apply runs behind `withPreMigrationBackup`: a snapshot is taken
 * first whenever this database has journal entries left to apply AND
 * already carries a schema of its own, removed once they all land, and
 * left on disk with its path logged when one throws. A database being
 * created here — the first-ever mount of the data volume — has nothing
 * to snapshot and is migrated directly.
 */
export function openMediaDb(path: string): OpenedMediaDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as MediaDb;
  const migrations = migrationsDir();
  try {
    withPreMigrationBackup(
      { connection: raw, databasePath: path, migrationsFolder: migrations },
      () => migrate(db, { migrationsFolder: migrations })
    );
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
