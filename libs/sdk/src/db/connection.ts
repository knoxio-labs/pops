/**
 * The slice of a SQLite driver this module needs.
 *
 * Structural on purpose: `libs/sdk` must stay free of a native dependency
 * (it is also imported from a browser bundle through `/react`), and every
 * pillar already holds its own `better-sqlite3` handle. A `Database` from
 * that package satisfies this interface without a cast.
 */
export interface SqliteStatement {
  all(...params: readonly unknown[]): unknown[];
  get(...params: readonly unknown[]): unknown;
  run(...params: readonly unknown[]): unknown;
}

/** The driver surface {@link SqliteStatement} is prepared from. */
export interface SqliteConnection {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
  pragma(sql: string): unknown;
}

/**
 * `true` when `path` names a database that never touches the filesystem.
 *
 * Both spellings SQLite accepts are covered: the bare `:memory:` sentinel and
 * a URI carrying `mode=memory`. Nothing may be snapshotted or restored for
 * one of these — a backup would land in a file literally named `:memory:.bak`
 * beside the process's working directory.
 */
export function isInMemoryDatabasePath(path: string): boolean {
  return path === ':memory:' || path === '' || /^file:.*mode=memory/.test(path);
}

/** Rows in `sqlite_master` that belong to a schema rather than to SQLite or drizzle. */
const INTERNAL_TABLE_PREFIXES = ['sqlite_', '__drizzle_'];

/**
 * `true` when the database holds no schema of its own yet.
 *
 * The fresh-volume contract depends on this: a pillar image whose data volume
 * is being mounted for the very first time opens an empty file and applies its
 * whole journal, and there is by definition nothing there to lose. Snapshotting
 * that would write a second empty file per boot and turn an unwritable data
 * directory into a boot failure.
 */
export function isEmptyDatabase(connection: SqliteConnection): boolean {
  const rows = connection.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
    name: unknown;
  }[];
  const names = rows
    .map((row) => row.name)
    .filter((name): name is string => typeof name === 'string');
  return !names.some((name) => !INTERNAL_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix)));
}

/** SQLite identifiers this module is willing to interpolate into SQL. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Count rows in `table`, or `undefined` when the table does not exist.
 *
 * The table name cannot be bound as a parameter, so it is validated against
 * {@link SAFE_IDENTIFIER} first and rejected outright otherwise — the repo
 * bans string interpolation into SQL, and a whitelist is what makes this the
 * documented exception rather than a hole.
 *
 * @throws When `table` is not a plain SQLite identifier.
 */
export function countRows(connection: SqliteConnection, table: string): number | undefined {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(`refusing to count rows in "${table}": not a plain SQLite identifier`);
  }
  const exists = connection
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  if (exists === undefined) return undefined;
  const row = connection.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: unknown };
  return typeof row.n === 'number' ? row.n : Number(row.n);
}
