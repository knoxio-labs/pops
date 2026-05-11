/**
 * Orphan warning for the per-module migration runner.
 *
 * If `__drizzle_migrations` contains hashes for tags whose owning module
 * is now absent (the operator removed it from `POPS_APPS`/`POPS_OVERLAYS`
 * without dropping the data), we log a warning so the operator sees the
 * drift. Data is preserved — orphan migrations are NEVER deleted.
 *
 * Lives in its own file to keep the runner under the per-file line cap.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../lib/logger.js';
import { DRIZZLE_MIGRATIONS_DIRECTORY } from './migrations-runner.js';
import { migrationOwnershipMap, readJournal } from './per-module-migrations.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { ModuleManifest } from '@pops/types';

function hashSql(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function readMigrationSql(tag: string): string {
  return readFileSync(join(DRIZZLE_MIGRATIONS_DIRECTORY, `${tag}.sql`), 'utf8');
}

function ensureDrizzleTable(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
}

function appliedHashes(db: BetterSqlite3.Database): Set<string> {
  const rows = db.prepare('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[];
  return new Set(rows.map((r) => r.hash));
}

/**
 * Manifest-graph variant: builds the install-set and ownership map from
 * the supplied manifests. Tests use this; the boot path can't (manifests
 * transitively import `db.ts`, creating a cycle).
 */
export function warnOrphanMigrations(
  db: BetterSqlite3.Database,
  manifests: readonly ModuleManifest[],
  knownOwners?: ReadonlyMap<string, string>
): readonly string[] {
  return warnOrphanMigrationsByOwner(
    db,
    new Set(manifests.map((m) => m.id)),
    knownOwners ?? migrationOwnershipMap(manifests)
  );
}

/**
 * Boot-time variant taking install-set + ownership map directly.
 *
 * Ambiguity handling: when two journal entries share the same SQL body
 * (and therefore the same hash), `__drizzle_migrations` records a single
 * row without tag attribution. We cannot tell which tag was applied, so
 * we suppress the orphan warning for every tag sharing an ambiguous hash.
 * The apply path mirrors this on its side (the duplicate-hash entry is
 * bucketed as `alreadyApplied`).
 */
export function warnOrphanMigrationsByOwner(
  db: BetterSqlite3.Database,
  installedIds: ReadonlySet<string>,
  owners: ReadonlyMap<string, string>
): readonly string[] {
  ensureDrizzleTable(db);

  const journal = readJournal();
  const recorded = appliedHashes(db);

  const hashCounts = new Map<string, number>();
  for (const entry of journal.entries) {
    const hash = hashSql(readMigrationSql(entry.tag));
    hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1);
  }

  const orphans: string[] = [];
  for (const entry of journal.entries) {
    const hash = hashSql(readMigrationSql(entry.tag));
    if (!recorded.has(hash)) continue;
    if ((hashCounts.get(hash) ?? 0) > 1) continue;
    const owner = owners.get(entry.tag);
    if (owner === undefined) continue;
    if (!installedIds.has(owner)) orphans.push(entry.tag);
  }

  if (orphans.length > 0) {
    logger.warn(
      { orphanMigrations: orphans },
      `[db] ${orphans.length} applied migration(s) belong to modules not in the install set — data preserved but inaccessible until the module is re-enabled.`
    );
  }
  return orphans;
}
