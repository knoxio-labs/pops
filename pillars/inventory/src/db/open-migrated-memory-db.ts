/**
 * An in-memory inventory database brought up by the real migration journal.
 * Shared by the `__tests__` helper of the same shape (`migrated-db.ts`, which
 * also exports `MIGRATIONS_DIR` for suites that read the journal directly)
 * and `command-vector-fixture.ts`: the latter cannot import from `__tests__`,
 * since `tsconfig.build.json` excludes that directory from the compiled
 * project and a production file may not depend on an excluded one.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { registerPersistedItemTypesMigrationFunctions } from './migrations/persisted-item-types-bootstrap.js';

import type { InventoryDb } from './services/internal.js';

/** An in-memory migrated database: the drizzle handle and the raw connection. */
export interface MigratedMemoryDb {
  db: InventoryDb;
  raw: Database.Database;
}

/** Open `:memory:` with foreign keys on and apply every journal entry from this package's `migrations/` folder. */
export function openMigratedMemoryDb(): MigratedMemoryDb {
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  registerPersistedItemTypesMigrationFunctions(raw);
  const db = drizzle(raw);
  migrate(db, { migrationsFolder });
  return { db, raw };
}
