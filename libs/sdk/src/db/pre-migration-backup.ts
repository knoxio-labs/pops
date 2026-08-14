/**
 * A restore point taken immediately before a pillar applies pending
 * migrations, and removed again the moment they all land.
 *
 * Each pillar migrates its own SQLite file on startup, inside the container,
 * with nobody watching. A journal is several files and SQLite only rolls back
 * the one statement that failed, so a half-applied chain is a real state a
 * database can be left in — and the only other copy is Litestream's stream,
 * which is offsite, continuous, and therefore already following the damage.
 * A local snapshot taken one moment earlier is the cheap thing that turns
 * that into a file copy.
 *
 * Deliberately NOT an auto-restore: the failing process still holds the
 * handle, and overwriting the live file from under it trades a diagnosable
 * half-applied database for an undiagnosable one. The snapshot is preserved
 * and its path logged instead; restoring it is an operator step, and
 * `docs/runbooks/pillar-go-live.md` is where that step is written down.
 */
import { copyFileSync, rmSync } from 'node:fs';

import { isEmptyDatabase, isInMemoryDatabasePath, type SqliteConnection } from './connection.js';
import { pendingMigrations, type MigrationJournalEntry } from './migration-journal.js';

/** What {@link withPreMigrationBackup} did, for callers that want to assert on it. */
export interface PreMigrationBackupOutcome {
  /** Journal entries that were pending when the database was opened. */
  readonly pending: readonly MigrationJournalEntry[];
  /** Absolute path of the snapshot taken, or `undefined` when none was needed. */
  readonly backupPath: string | undefined;
  /** How the snapshot was taken, or `undefined` when none was needed. */
  readonly method: 'vacuum-into' | 'checkpoint-copy' | undefined;
}

/** Inputs to {@link withPreMigrationBackup}. */
export interface PreMigrationBackupOptions {
  /** Open handle to the database about to be migrated. */
  readonly connection: SqliteConnection;
  /** Filesystem path that handle was opened from. */
  readonly databasePath: string;
  /** Folder holding `meta/_journal.json` and the `.sql` files. */
  readonly migrationsFolder: string;
  /** Clock, injectable so a test can pin the snapshot's filename. */
  readonly now?: () => Date;
  /** Where progress goes. Defaults to `console.warn`. */
  readonly log?: (message: string) => void;
}

function defaultLog(message: string): void {
  console.warn(message);
}

/** `2026-08-13T04-05-06-007Z` — sortable, and legal on every filesystem. */
function stamp(at: Date): string {
  return at.toISOString().replaceAll(':', '-').replace('.', '-');
}

/** Where a snapshot of `databasePath` taken at `at` is written. */
export function preMigrationBackupPath(databasePath: string, at: Date): string {
  return `${databasePath}.pre-migration-${stamp(at)}.bak`;
}

function describeCause(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Copy the database to `target`.
 *
 * `VACUUM INTO` is the first choice because it reads through the WAL: the
 * copy is a consistent point even while pages are uncommitted, which a plain
 * file copy of the `.db` alone is not. It needs SQLite 3.27+ and enough free
 * space for a second copy, so a checkpoint-then-copy fallback covers the
 * hosts where it cannot run — `wal_checkpoint(TRUNCATE)` folds the WAL back
 * into the main file first so the copy is not missing the newest pages.
 */
function copyDatabase(
  connection: SqliteConnection,
  databasePath: string,
  target: string
): 'vacuum-into' | 'checkpoint-copy' {
  rmSync(target, { force: true });
  try {
    connection.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    return 'vacuum-into';
  } catch (vacuumErr) {
    try {
      connection.pragma('wal_checkpoint(TRUNCATE)');
      copyFileSync(databasePath, target);
      return 'checkpoint-copy';
    } catch (copyErr) {
      throw new Error(
        `[db] refusing to migrate ${databasePath}: no pre-migration backup could be written to ` +
          `${target} (VACUUM INTO: ${describeCause(vacuumErr)}; checkpoint+copy: ${describeCause(copyErr)}). ` +
          'Free space on the data volume, or make it writable, and restart.',
        { cause: copyErr }
      );
    }
  }
}

/**
 * Run `apply` — the pillar's `migrate()` call — behind a snapshot of the
 * database, and report what was done.
 *
 * The snapshot is skipped, and `apply` invoked directly, when there is
 * nothing to protect: an in-memory database, a database with no schema of its
 * own (the first-ever mount of a pillar's data volume), or a journal with no
 * pending entries (every restart after the deploy that applied them).
 *
 * On success the snapshot is deleted. On failure it is left on disk, its path
 * is logged, and the original error is re-thrown unchanged so the caller's
 * own handling — closing the handle, failing the boot — is unaffected.
 *
 * @throws Whatever `apply` throws, and an error of its own when a snapshot is
 *   warranted but cannot be written.
 */
export function withPreMigrationBackup<T>(
  options: PreMigrationBackupOptions,
  apply: () => T
): { result: T; outcome: PreMigrationBackupOutcome } {
  const log = options.log ?? defaultLog;
  const now = options.now ?? ((): Date => new Date());
  const pending = pendingMigrations(options.connection, options.migrationsFolder);

  const skip =
    pending.length === 0 ||
    isInMemoryDatabasePath(options.databasePath) ||
    isEmptyDatabase(options.connection);
  if (skip) {
    return { result: apply(), outcome: { pending, backupPath: undefined, method: undefined } };
  }

  const backupPath = preMigrationBackupPath(options.databasePath, now());
  log(`[db] Backing up before applying ${pending.length} migration(s)...`);
  const method = copyDatabase(options.connection, options.databasePath, backupPath);

  let result: T;
  try {
    result = apply();
  } catch (err) {
    log(`[db] Migration failed. Backup preserved at ${backupPath}`);
    throw err;
  }
  rmSync(backupPath, { force: true });
  log('[db] All migrations applied. Backup removed.');
  return { result, outcome: { pending, backupPath, method } };
}
