/**
 * Opener for the purchases pillar's SQLite database.
 *
 * Relies on drizzle-orm's built-in `migrate` helper to apply the
 * in-package migrations journal at
 * `pillars/purchases/migrations/meta/_journal.json`.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import type { PurchasesDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this pillar. Resolved relative to
 * this module's location so it works both from `src` in dev and from the
 * built `dist` layout.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/**
 * Result of {@link openPurchasesDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides).
 */
export interface OpenedPurchasesDb {
  /** Drizzle handle. */
  db: PurchasesDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the purchases pillar's SQLite database at `path`, configure it,
 * apply the in-package migrations journal, and return both the drizzle
 * wrapper and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL` and `busy_timeout=5000` are enabled up front.
 *     `foreign_keys` is left OFF for the migration itself (see below) and
 *     turned ON once it has applied cleanly — every ordinary query this
 *     opener hands back afterwards runs with it on, which is load-bearing:
 *     `purchase_items` and `purchase_charges` both cascade from
 *     `purchases`, and SQLite silently ignores `ON DELETE cascade` when
 *     the pragma is off.
 *   - Every migration in the journal is applied via drizzle's built-in
 *     migrator (idempotent — re-running against the same DB short-circuits
 *     on the `__drizzle_migrations` hash check).
 *
 * **Why the migration itself runs with `foreign_keys` off.** SQLite has no
 * `ALTER TABLE` for a CHECK constraint (0019 widens `purchases.status`'s
 * this way), so widening one means `CREATE TABLE __new_x`, copy, `DROP
 * TABLE x`, rename. With enforcement on, `DROP TABLE` on a table other
 * rows cascade from performs the same deletes an explicit `DELETE FROM x`
 * would — silently erasing every `purchase_charges`/`purchase_items`/...
 * row whose parent got rebuilt, even though the same ids exist again the
 * instant the rename completes. And it cannot be toggled off only for
 * that one migration's statements: drizzle's migrator wraps every pending
 * migration in one `BEGIN`, and `PRAGMA foreign_keys` is a documented
 * no-op inside an open transaction, so the pragma has to already be off
 * before that `BEGIN` runs. Once the batch commits, `foreign_key_check`
 * below is what actually verifies nothing rebuilt was left dangling — the
 * pragma being off never suppressed constraint violations, only the
 * cascade side effect.
 *
 * If the migration apply throws (corrupt DB, malformed migration, missing
 * folder, or the `foreign_key_check` below finding a violation), the raw
 * handle is closed before the error is re-thrown so the caller can't leak
 * a locked file descriptor.
 *
 * The apply runs behind `withPreMigrationBackup`: a snapshot is taken
 * first whenever this database has journal entries left to apply AND
 * already carries a schema of its own, removed once they all land, and
 * left on disk with its path logged when one throws. A database being
 * created here — the first-ever mount of the data volume — has nothing
 * to snapshot and is migrated directly.
 */
export function openPurchasesDb(path: string): OpenedPurchasesDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('busy_timeout = 5000');
  raw.pragma('foreign_keys = OFF');
  const db = drizzle(raw) as PurchasesDb;
  const migrations = migrationsDir();
  try {
    withPreMigrationBackup(
      { connection: raw, databasePath: path, migrationsFolder: migrations },
      () => migrate(db, { migrationsFolder: migrations })
    );
    raw.pragma('foreign_keys = ON');
    const violations = raw.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `openPurchasesDb: foreign_key_check found ${String(violations.length)} violation(s) after migrating ${path}`
      );
    }
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
