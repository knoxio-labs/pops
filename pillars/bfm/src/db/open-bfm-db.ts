/**
 * Opener for the bfm pillar's SQLite database.
 *
 * One of the three patterns every pillar repeats rather than shares (see
 * AGENTS.md, "Conventions duplicated per pillar"): the pragmas below match
 * `pillars/purchases/src/db/open-purchases-db.ts` and its siblings
 * deliberately, and a change to any of them has to be made in each opener.
 *
 * Pragmas, and why this pillar needs each:
 *   - `journal_mode = WAL` — a read must not block while a token rotation
 *     writes. Every authenticated request reads this DB.
 *   - `foreign_keys = ON` — load-bearing, not hygiene. `refresh_tokens`
 *     cascades from `devices` and self-references through `replacedBy`;
 *     SQLite silently ignores both when the pragma is off, so an orphaned
 *     token chain would look like a valid one.
 *   - `busy_timeout = 5000` — a concurrent refresh from the same handset
 *     should wait for the writer, not fail with SQLITE_BUSY.
 *
 * Migrations are applied through drizzle's built-in migrator against the
 * committed journal at `pillars/bfm/migrations/meta/_journal.json`.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/**
 * A drizzle handle — either the top-level db or a transaction.
 *
 * `Record<string, unknown>` rather than `Record<string, never>` so the alias
 * accepts both a narrow per-table handle and the one {@link openBfmDb}
 * returns.
 */
export type BfmDb = BetterSQLite3Database<Record<string, unknown>>;

/**
 * Path to the migrations folder inside this pillar. Resolved from this
 * module's own location rather than `process.cwd()` so it holds through the
 * workspace symlink in dev, from the built `dist` layout, and inside the
 * image — three places with three different working directories.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/**
 * Result of {@link openBfmDb}. The raw handle is exposed for callers that
 * need lifecycle control — closing on shutdown, prepared statements, pragmas
 * the drizzle wrapper hides.
 */
export interface OpenedBfmDb {
  /** Drizzle handle. */
  db: BfmDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the bfm pillar's SQLite database at `path`, configure it, apply the
 * in-package migrations journal, and return both the drizzle wrapper and the
 * raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - The pragmas documented in this file's header are set.
 *   - Every migration in the journal is applied (idempotent — re-running
 *     against the same DB short-circuits on drizzle's hash check).
 *
 * If the migration apply throws — corrupt DB, malformed migration, missing
 * folder — the raw handle is closed before the error is re-thrown, so a
 * failed boot cannot leak a locked file descriptor.
 *
 * The apply runs behind `withPreMigrationBackup`: a snapshot is taken
 * first whenever this database has journal entries left to apply AND
 * already carries a schema of its own, removed once they all land, and
 * left on disk with its path logged when one throws. A database being
 * created here — the first-ever mount of the data volume — has nothing
 * to snapshot and is migrated directly.
 */
export function openBfmDb(path: string): OpenedBfmDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as BfmDb;
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
