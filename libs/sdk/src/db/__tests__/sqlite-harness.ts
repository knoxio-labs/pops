/**
 * A real SQLite connection for this module's tests, over Node's built-in
 * driver.
 *
 * `node:sqlite` rather than `better-sqlite3` deliberately: `libs/sdk` is a
 * dependency of every pillar, including the four that own no database, and a
 * native devDependency here would land in each of their Docker builder stages
 * for no reason. Node's driver is the same SQLite, so `VACUUM INTO`, the WAL
 * and `sqlite_master` behave exactly as they will in a pillar.
 */
import { DatabaseSync } from 'node:sqlite';

import type { SqliteConnection } from '../connection.js';

/** A test connection, plus the handle lifecycle a test needs. */
export interface TestConnection extends SqliteConnection {
  close(): void;
}

/** Open `path` (or an in-memory database) as a {@link SqliteConnection}. */
export function openTestDatabase(path: string): TestConnection {
  const db = new DatabaseSync(path);
  return {
    prepare: (sql: string) => db.prepare(sql),
    exec: (sql: string) => db.exec(sql),
    pragma: (statement: string) => db.exec(`PRAGMA ${statement}`),
    close: () => db.close(),
  };
}

/**
 * Record `entries` in `__drizzle_migrations` the way drizzle's migrator does,
 * so `pendingMigrations` is asked the same question it is asked at runtime.
 */
export function recordAppliedMigrations(
  connection: SqliteConnection,
  appliedAtMillis: readonly number[]
): void {
  connection.exec(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`
  );
  for (const when of appliedAtMillis) {
    connection
      .prepare(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)`)
      .run(`hash-${when}`, when);
  }
}
