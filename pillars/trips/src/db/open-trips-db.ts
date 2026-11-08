import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import * as schema from './schema.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** Drizzle database type for the trips pillar's private schema. */
export type TripsDb = BetterSQLite3Database<typeof schema>;

/** Handles returned after opening and migrating the trips database. */
export interface OpenedTripsDb {
  /** Drizzle handle for vocabulary queries. */
  readonly db: TripsDb;
  /** Raw SQLite handle used by health probes and shutdown. */
  readonly raw: Database.Database;
}

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/** Open the private SQLite database, apply its migrations, and return its handles. */
export function openTripsDb(path: string): OpenedTripsDb {
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
