/**
 * An in-memory inventory database brought up by the real migration journal,
 * for db-layer suites. Using the journal rather than inlined DDL means a suite
 * cannot keep passing against a schema the migrations no longer produce.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openMigratedMemoryDb, type MigratedMemoryDb } from '../open-migrated-memory-db.js';

/** The package's migrations folder. */
export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

/** A migrated in-memory database: the drizzle handle and the raw connection. */
export type MigratedTestDb = MigratedMemoryDb;

/** Open `:memory:` with foreign keys on and apply every journal entry. */
export function openMigratedTestDb(): MigratedTestDb {
  return openMigratedMemoryDb();
}
