/**
 * Database safety mechanisms shared by every pillar that owns a SQLite file.
 *
 * Node-only, and deliberately driver-agnostic: nothing here imports
 * `better-sqlite3` or `drizzle-orm`. A pillar passes its own open handle and
 * its own `migrate()` call in. See `libs/sdk/README.md` for the entry-point
 * table and `docs/runbooks/pillar-go-live.md` for the operator's half.
 */
export {
  countRows,
  isEmptyDatabase,
  isInMemoryDatabasePath,
  type SqliteConnection,
  type SqliteStatement,
} from './connection.js';
export {
  journalPath,
  lastAppliedMigrationAt,
  pendingMigrations,
  readMigrationJournal,
  type MigrationJournalEntry,
} from './migration-journal.js';
export {
  preMigrationBackupPath,
  withPreMigrationBackup,
  type PreMigrationBackupOptions,
  type PreMigrationBackupOutcome,
} from './pre-migration-backup.js';
export {
  assertDestructiveCommandAllowed,
  DestructiveCommandRefusedError,
  isForced,
  type DestructiveCommandOptions,
} from './destructive-guard.js';
export { stageMigrationsThrough, type StageMigrationsOptions } from './stage-migrations.js';
