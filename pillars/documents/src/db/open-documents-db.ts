import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { withPreMigrationBackup } from '@pops/pillar-sdk/db';

import * as schema from './schema.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** Documents-private SQLite ledger type. */
export type DocumentsDb = BetterSQLite3Database<typeof schema>;

/** Live ledger and raw handle for health checks and orderly shutdown. */
export interface OpenedDocumentsDb {
  readonly db: DocumentsDb;
  readonly raw: Database.Database;
}

/** Open the private ledger using ordinary generated Drizzle migrations and pre-migration backups. */
export function openDocumentsDb(path: string): OpenedDocumentsDb {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const raw = new Database(path);
  try {
    chmodSync(path, 0o600);
    raw.pragma('journal_mode = WAL');
    raw.pragma('synchronous = FULL');
    raw.pragma('foreign_keys = ON');
    raw.pragma('busy_timeout = 5000');
    const db = drizzle(raw, { schema });
    const migrationsFolder = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'migrations'
    );
    withPreMigrationBackup({ connection: raw, databasePath: path, migrationsFolder }, () =>
      migrate(db, { migrationsFolder })
    );
    return { db, raw };
  } catch (error) {
    raw.close();
    throw error;
  }
}
