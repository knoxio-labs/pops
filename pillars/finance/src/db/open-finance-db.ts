/**
 * Standalone opener for the finance pillar's SQLite database.
 *
 * The opener is intentionally minimal — it does NOT load the sqlite-vec
 * extension (finance uses no vector indexes) and relies on drizzle-orm's
 * built-in `migrate` helper to apply this package's migrations journal at
 * `pillars/finance/migrations/meta/_journal.json`.
 *
 * The pillar's API host (`src/api/server.ts`) calls this on boot with the
 * path from `resolveFinanceSqlitePath` (`FINANCE_SQLITE_PATH` env var).
 */
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import { buildImportDedupKeyFromStoredRow } from '../contract/import-dedup.js';
import { anzForeignChargeNoteField } from './anz-fx-note.js';

import type { FinanceDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this package. Resolved relative
 * to this module's location (`src/db/open-finance-db.ts` in dev,
 * `dist/db/open-finance-db.js` after build) so it works both from source
 * and when bundled into a Docker image's `node_modules/@pops/finance/`.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/** Result of {@link openFinanceDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides). */
export interface OpenedFinanceDb {
  /** Drizzle handle — pass into any `wishListService.*` call. */
  db: FinanceDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the finance pillar's SQLite database at `path`, configure it,
 * apply the in-package migrations journal, and return both the drizzle
 * wrapper and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000`
 *     are enabled.
 *   - Every migration in `migrations/meta/_journal.json` is applied via
 *     drizzle's built-in migrator (idempotent — re-running against the
 *     same DB short-circuits on the `__drizzle_migrations` hash check).
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
 *
 * The journal is self-bootstrapping: idx 0
 * `0053_finance_pillar_baseline` CREATEs the tables the later
 * `0025`/`0026`/`0027`/`0052` entries ALTER, so against a fresh
 * finance.db the baseline runs first.
 */
/**
 * Register the finance pillar's custom SQLite functions on a raw connection.
 *
 * `finance_canonical_checksum(date, amount, description, raw_row)` recomputes a
 * transaction's canonical dedup checksum (see {@link buildImportDedupKeyFromStoredRow}).
 * It exists so migration `0059_recompute_canonical_checksum` can re-key every
 * stored row from SQL — it MUST be registered before {@link migrate} runs, and
 * derives the identical key the browser parser hashes so an existing row and a
 * re-import of the same charge collide.
 *
 * `finance_anz_fx_note(notes, field)` reads one field back out of a legacy ANZ
 * foreign-charge note (see `anz-fx-note.ts`), returning NULL for any note it did
 * not write. Migration `0066_transaction_foreign_charge_columns` backfills the
 * typed columns through it and refuses to run when a candidate note comes back
 * NULL, so the two must be registered together.
 */
export function registerFinanceSqlFunctions(raw: Database.Database): void {
  raw.function(
    'finance_canonical_checksum',
    { deterministic: true },
    (date: unknown, amount: unknown, description: unknown, rawRow: unknown): string => {
      const key = buildImportDedupKeyFromStoredRow({
        date: typeof date === 'string' ? date : String(date ?? ''),
        amount: typeof amount === 'number' ? amount : Number(amount ?? 0),
        description: typeof description === 'string' ? description : String(description ?? ''),
        rawRow: typeof rawRow === 'string' ? rawRow : null,
      });
      return createHash('sha256').update(key).digest('hex');
    }
  );
  raw.function('finance_anz_fx_note', { deterministic: true }, anzForeignChargeNoteField);
}

export function openFinanceDb(path: string): OpenedFinanceDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  registerFinanceSqlFunctions(raw);
  const db = drizzle(raw) as FinanceDb;
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
