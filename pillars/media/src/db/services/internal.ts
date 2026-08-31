/**
 * Shared helpers for the media schema service layer.
 *
 * Only `MediaDb` is re-exported from the package barrel so callers can type
 * the handle they pass in; any additional helpers added here stay internal
 * to `src/services/*.ts`. Follows the standard per-pillar db-handle alias.
 */
import { getTableName, type SQL, sql } from 'drizzle-orm';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

/** A drizzle handle — either the top-level db or a transaction. */
export type MediaDb = BetterSQLite3Database<Record<string, unknown>>;

/**
 * A table-qualified column reference, for correlating a subquery to the outer
 * query.
 *
 * Interpolating a column into a `sql` template renders it bare — `"id"` — and
 * SQLite resolves a bare name against the innermost `FROM` first. Inside a
 * subquery that silently rebinds the outer column to the subquery's own table:
 * `media_id = id` compared `watch_history.media_id` to `watch_history.id`,
 * true only where a row's primary key happened to equal the movie it referred
 * to. It raised no error, it just answered zero — which read as "nothing has
 * ever been watched" across the whole library.
 *
 * Use this for any column of the OUTER query referenced inside a subquery.
 */
export function outerColumn(table: SQLiteTable, column: AnySQLiteColumn): SQL {
  return sql.raw(`"${getTableName(table)}"."${column.name}"`);
}
