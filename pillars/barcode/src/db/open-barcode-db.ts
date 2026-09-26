import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import * as schema from './schema.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** Drizzle database type for the barcode pillar's private schema. */
export type BarcodeDb = BetterSQLite3Database<typeof schema>;

/** The handles returned after opening and migrating the barcode database. */
export interface OpenedBarcodeDb {
  /** Drizzle handle used by the lookup service. */
  readonly db: BarcodeDb;
  /** Raw SQLite handle used for health checks and shutdown. */
  readonly raw: Database.Database;
}

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/**
 * Open the barcode SQLite file, apply its committed migrations, and return
 * both the typed Drizzle handle and the raw handle used for lifecycle work.
 */
export function openBarcodeDb(path: string): OpenedBarcodeDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);

  try {
    raw.pragma('journal_mode = WAL');
    raw.pragma('foreign_keys = ON');
    raw.pragma('busy_timeout = 5000');
    const db = drizzle(raw, { schema });
    const migrations = migrationsDir();
    withPreMigrationBackup(
      { connection: raw, databasePath: path, migrationsFolder: migrations },
      () => migrate(db, { migrationsFolder: migrations })
    );
    return { db, raw };
  } catch (error) {
    raw.close();
    throw error;
  }
}
