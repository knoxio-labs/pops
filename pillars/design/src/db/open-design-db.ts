/**
 * Opener for the design pillar's SQLite database.
 *
 * One of the three patterns every pillar repeats rather than shares (see
 * AGENTS.md, "Conventions duplicated per pillar"): the pragmas below match
 * `pillars/bfm/src/db/open-bfm-db.ts` and its siblings deliberately, and a
 * change to any of them has to be made in each opener.
 *
 * Pragmas, and why this pillar needs each:
 *   - `journal_mode = WAL` — the overlay polls threads while a session writes
 *     replies and statuses; a read must not block on that.
 *   - `foreign_keys = ON` — load-bearing. `design_messages` cascades from
 *     `design_threads`; with the pragma off SQLite ignores the cascade and a
 *     deleted thread leaves its messages behind as unreachable rows.
 *   - `busy_timeout = 5000` — two browsers commenting at once should wait for
 *     the writer rather than fail with SQLITE_BUSY.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A drizzle handle — either the top-level db or a transaction. */
export type DesignDb = BetterSQLite3Database<Record<string, unknown>>;

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

/** Result of {@link openDesignDb}. */
export interface OpenedDesignDb {
  /** Drizzle handle. */
  db: DesignDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the design pillar's SQLite database at `path`, configure it, apply the
 * in-package migrations journal, and return both handles.
 *
 * The raw handle is closed before any pragma or migration failure is
 * re-thrown: a handle that escapes unclosed is finalised natively at GC time,
 * and a pass that lands after Node's environment cleanup hooks aborts the
 * process rather than merely leaking. Same reasoning as `openBfmDb`.
 */
export function openDesignDb(path: string): OpenedDesignDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  try {
    raw.pragma('journal_mode = WAL');
    raw.pragma('foreign_keys = ON');
    raw.pragma('busy_timeout = 5000');
    const db = drizzle(raw) as DesignDb;
    const migrations = migrationsDir();
    withPreMigrationBackup(
      { connection: raw, databasePath: path, migrationsFolder: migrations },
      () => migrate(db, { migrationsFolder: migrations })
    );
    return { db, raw };
  } catch (err) {
    raw.close();
    throw err;
  }
}
