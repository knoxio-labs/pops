/**
 * Row-level truncation for a single pillar's SQLite file.
 *
 * "Clear" means every row a pillar owns is deleted while the schema and the
 * migration journal survive: the next process to open the file finds its
 * tables already at the head of `pillars/<id>/migrations/`, applies nothing,
 * and starts on an empty database. That is why the journal must be preserved
 * — wiping `__drizzle_migrations` would make the next boot replay migrations
 * against tables that already exist and fail.
 *
 * Tables are discovered from `sqlite_master` rather than listed per pillar, so
 * a new migration is covered the day it lands and no list can go stale.
 */
import type { DatabaseSync } from 'node:sqlite';

/**
 * Tables that survive a clear:
 *   - `sqlite_%`  — SQLite's own catalogue (reserved namespace).
 *   - `__drizzle_migrations` — the migration journal (see above).
 *   - `_litestream_%` — the replication bookkeeping Litestream writes into
 *     each replicated database (`infra/litestream/<id>.yml`); deleting those
 *     rows out from under a running replica corrupts its generation tracking.
 */
const PRESERVED_TABLE_PREFIXES = ['sqlite_', '__drizzle_migrations', '_litestream'] as const;

export interface ClearedTable {
  readonly table: string;
  readonly deleted: number;
}

export function isPreservedTable(name: string): boolean {
  return PRESERVED_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Every user table in the database, in a stable order, journal excluded. */
export function listClearableTables(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all();
  const names: string[] = [];
  for (const row of rows) {
    const name = row['name'];
    if (typeof name === 'string' && !isPreservedTable(name)) names.push(name);
  }
  return names;
}

/**
 * Delete every row from every clearable table in one transaction, leaving the
 * schema and migration journal in place. Returns per-table deleted counts.
 *
 * Foreign keys are disabled for the duration so the delete order cannot matter
 * — a pillar's tables form a graph, and re-deriving a topological order on
 * every run is a stale-list problem in disguise.
 */
export function clearPillarTables(db: DatabaseSync): ClearedTable[] {
  const tables = listClearableTables(db);
  // Table names come from `sqlite_master`, so they are whatever the pillar's
  // own migrations created; they cannot be bound as parameters, so they are
  // quoted with the embedded-quote escape SQLite defines for identifiers.
  const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      const cleared: ClearedTable[] = [];
      for (const table of tables) {
        const { changes } = db.prepare(`DELETE FROM ${quote(table)}`).run();
        cleared.push({ table, deleted: Number(changes) });
      }
      // AUTOINCREMENT high-water marks are not rows of a user table, and a
      // seeder that expects deterministic ids needs them back at zero.
      if (hasTable(db, 'sqlite_sequence')) db.exec('DELETE FROM sqlite_sequence');
      db.exec('COMMIT');
      return cleared;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== undefined;
}
