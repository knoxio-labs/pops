/**
 * Opening a database that already held rows when a migration ran.
 *
 * Every other suite opens a file that was empty at migration time, so a
 * backfill that stamped nothing — or stamped the wrong thing on everything —
 * passes all of them and is discovered against the live file, by which point
 * the rows it mislabelled are indistinguishable from correct ones.
 *
 * The shape is always the same: stage the journal truncated at the last
 * migration before the one under test, migrate to there, seed with raw SQL
 * shaped the way the adapters actually wrote it, close, then reopen with the
 * real opener — drizzle's migrator applies only the entries newer than the
 * last one recorded. Shared because a copy per migration is a copy to update
 * the day the opener changes, and the one left behind keeps passing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { stageMigrationsThrough } from '@pops/pillar-sdk/db';

import { openPurchasesDb } from '../open-purchases-db.js';

import type { OpenedPurchasesDb } from '../index.js';

export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

export interface SeededAtMigration {
  /** The database, reopened with every migration after `through` applied. */
  readonly opened: OpenedPurchasesDb;
  /** The temp directory holding it, for a suite asserting on what the opener left beside the file. */
  readonly dir: string;
  readonly cleanup: () => void;
}

export interface SeedAtMigrationOptions {
  /** The last journal entry to apply before seeding, by tag. */
  readonly through: string;
  /** Names the temp directory, so a failing run says which suite left it. */
  readonly prefix: string;
  /** Writes the rows as they stood at `through`, over a raw connection. */
  readonly seed: (raw: Database.Database) => void;
}

export function openSeededAtMigration(options: SeedAtMigrationOptions): SeededAtMigration {
  const dir = mkdtempSync(join(tmpdir(), options.prefix));
  const dbPath = join(dir, 'purchases.db');
  const staged = stageMigrationsThrough({
    migrationsFolder: MIGRATIONS_DIR,
    targetFolder: join(dir, 'staged-migrations'),
    through: options.through,
  });

  const raw = new Database(dbPath);
  // On, so a seed that violates a foreign key fails here rather than
  // producing rows the migration under test would never meet in production.
  raw.pragma('foreign_keys = ON');
  migrate(drizzle(raw), { migrationsFolder: staged });
  options.seed(raw);
  raw.close();

  const opened = openPurchasesDb(dbPath);
  return {
    opened,
    dir,
    cleanup: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
