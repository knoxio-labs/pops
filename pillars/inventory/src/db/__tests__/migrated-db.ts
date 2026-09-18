/**
 * An in-memory inventory database brought up by the real migration journal,
 * for db-layer suites. Using the journal rather than inlined DDL means a suite
 * cannot keep passing against a schema the migrations no longer produce.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { InventoryDb } from '../services/internal.js';

/** The package's migrations folder. */
export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** A migrated in-memory database: the drizzle handle and the raw connection. */
export interface MigratedTestDb {
  db: InventoryDb;
  raw: Database.Database;
}

/** Open `:memory:` with foreign keys on and apply every journal entry. */
export function openMigratedTestDb(): MigratedTestDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw);
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, raw };
}
