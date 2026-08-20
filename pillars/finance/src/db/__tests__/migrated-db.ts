/**
 * A fresh in-memory finance database carrying the current schema.
 *
 * The schema comes from the migration journal — the same source
 * `openFinanceDb` applies in production — rather than from a `CREATE TABLE`
 * literal pasted into each suite. A literal has to be found and edited every
 * time a column lands, and the only thing that reports a miss is an insert
 * failing with `table … has no column named …`; a suite that reads without
 * inserting keeps passing against whatever shape it was pinned to.
 *
 * The journal is applied once per worker and the resulting page image is
 * reused, so a suite calling this per test pays a deserialize rather than
 * seventy migrations.
 *
 * Suites that deliberately model a PRE-migration schema must NOT use this —
 * pinning them to the current shape is what makes a migration test vacuous.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { registerFinanceSqlFunctions } from '../open-finance-db.js';

import type { FinanceDb } from '../services/internal.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** A migrated database and the raw handle underneath it. */
export interface MigratedFinanceDb {
  /** Drizzle handle — pass into any service call. */
  readonly db: FinanceDb;
  /** Raw better-sqlite3 handle, for suites that seed or assert through SQL. */
  readonly raw: Database.Database;
}

let pageImage: Buffer | undefined;

function migratedPageImage(): Buffer {
  if (pageImage === undefined) {
    const raw = new Database(':memory:');
    registerFinanceSqlFunctions(raw);
    migrate(drizzle(raw), { migrationsFolder: MIGRATIONS_DIR });
    pageImage = raw.serialize();
    raw.close();
  }
  return pageImage;
}

/**
 * Open an empty database with every table, index and constraint the finance
 * migrations produce.
 */
export function freshMigratedFinanceDb(): MigratedFinanceDb {
  const raw = new Database(migratedPageImage());
  raw.pragma('foreign_keys = ON');
  registerFinanceSqlFunctions(raw);
  return { db: drizzle(raw), raw };
}
