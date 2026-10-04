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

interface ClearPillarTablesOptions {
  readonly beforeCommit?: (db: DatabaseSync) => void;
}

export function isPreservedTable(name: string): boolean {
  return PRESERVED_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Every user table and virtual table in the main database, journal excluded. */
export function listClearableTables(db: DatabaseSync): string[] {
  const rows = db.prepare('PRAGMA table_list').all();
  const names: string[] = [];
  for (const row of rows) {
    const name = row['name'];
    const schema = row['schema'];
    const type = row['type'];
    if (
      schema === 'main' &&
      (type === 'table' || type === 'virtual') &&
      typeof name === 'string' &&
      !isPreservedTable(name)
    ) {
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/**
 * Delete every row from every clearable table in one transaction, leaving the
 * schema and migration journal in place. Triggers on clearable tables are
 * temporarily removed because their normal-write guards can reject a database-wide reset;
 * they are restored before commit. Returns per-table deleted counts.
 *
 * Foreign keys are disabled for the duration so the delete order cannot matter
 * — a pillar's tables form a graph, and re-deriving a topological order on
 * every run is a stale-list problem in disguise.
 */
export function clearPillarTables(
  db: DatabaseSync,
  options: ClearPillarTablesOptions = {}
): ClearedTable[] {
  const tables = listClearableTables(db);
  const triggers = listClearableTriggers(db, tables);
  // Table names come from the database catalog; they cannot be bound as
  // parameters, so they are quoted with SQLite's embedded-quote escape.
  const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`);

      const cleared: ClearedTable[] = [];
      for (const table of tables) {
        const { changes } = db.prepare(`DELETE FROM ${quote(table)}`).run();
        cleared.push({ table, deleted: Number(changes) });
      }
      // AUTOINCREMENT high-water marks are not rows of a user table, and a
      // seeder that expects deterministic ids needs them back at zero.
      if (hasTable(db, 'sqlite_sequence')) db.exec('DELETE FROM sqlite_sequence');
      options.beforeCommit?.(db);
      for (const trigger of triggers) db.exec(trigger.sql);
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

function listClearableTriggers(
  db: DatabaseSync,
  tables: readonly string[]
): Array<{ readonly name: string; readonly sql: string }> {
  if (tables.length === 0) return [];
  const placeholders = tables.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN (${placeholders}) ORDER BY name`
    )
    .all(...tables);
  const triggers: Array<{ name: string; sql: string }> = [];
  for (const row of rows) {
    const name = row['name'];
    const sql = row['sql'];
    if (typeof name === 'string' && typeof sql === 'string') triggers.push({ name, sql });
  }
  return triggers;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== undefined;
}
