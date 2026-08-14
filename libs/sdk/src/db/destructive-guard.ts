/**
 * The check a script runs before it wipes, reseeds or resets a pillar's
 * database.
 *
 * Every destructive command is pillar-scoped — `db:clear:<id>` truncates one
 * pillar, food's seeder wipes one pillar's tables — which is exactly the shape
 * in which "the seeder refuses in production" gets re-implemented once per
 * pillar and drifts in the copy nobody is reading. It lives here so each
 * script states its own key tables and inherits identical behaviour.
 *
 * It is not the only refusal such a script needs. This one asks what the
 * database *contains*; a containment guard on the path (`scripts/db/
 * dev-db-guard.ts`, `pillars/food/scripts/dev-seed-guard.ts`) asks where the
 * database *is*, which is what catches a deployed volume the environment
 * never labelled production. They compose; neither subsumes the other.
 *
 * Two independent refusals, and only one of them can be waived:
 *
 *   - `NODE_ENV=production` is absolute. AGENTS.md's production rule admits no
 *     exception, and an env var that could turn it off would be found and set
 *     by exactly the automation the rule exists to stop.
 *   - Real data in a key table is waivable with `FORCE=true` (or `--force`),
 *     because "this dev database has rows in it" is also what a deliberate
 *     reset looks like. Waiving it prints what is about to be destroyed first.
 */
import { countRows, type SqliteConnection } from './connection.js';

/** Thrown when a destructive command must not run. Carries the reason for tests. */
export class DestructiveCommandRefusedError extends Error {
  /** Which check refused: the production environment, or data on disk. */
  readonly reason: 'production-environment' | 'populated-database';

  constructor(reason: 'production-environment' | 'populated-database', message: string) {
    super(message);
    this.name = 'DestructiveCommandRefusedError';
    this.reason = reason;
  }
}

/** Inputs to {@link assertDestructiveCommandAllowed}. */
export interface DestructiveCommandOptions {
  /** How the operator invoked this, e.g. `mise run db:seed:food`. */
  readonly command: string;
  /** Open handle to the database the command would damage. */
  readonly connection: SqliteConnection;
  /** Path that handle was opened from, so the message names the victim. */
  readonly databasePath: string;
  /**
   * Tables whose contents mean "this database holds data somebody cares
   * about". Pick the ones a real import or a real day of use fills, not
   * lookup tables the schema ships with. A table that does not exist yet is
   * ignored, so a half-migrated database does not read as populated.
   */
  readonly guardedTables: readonly string[];
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to `process.argv`. */
  readonly argv?: readonly string[];
  /** Where the override warning goes. Defaults to `console.warn`. */
  readonly log?: (message: string) => void;
}

function defaultLog(message: string): void {
  console.warn(message);
}

/** `true` when the operator asked, in either accepted spelling, to proceed anyway. */
export function isForced(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv
): boolean {
  return env['FORCE']?.trim().toLowerCase() === 'true' || argv.includes('--force');
}

interface PopulatedTable {
  readonly table: string;
  readonly rows: number;
}

function populatedTables(
  connection: SqliteConnection,
  tables: readonly string[]
): PopulatedTable[] {
  const populated: PopulatedTable[] = [];
  for (const table of tables) {
    const rows = countRows(connection, table);
    if (rows !== undefined && rows > 0) populated.push({ table, rows });
  }
  return populated;
}

function describe(populated: readonly PopulatedTable[]): string {
  return populated.map((entry) => `${entry.table}=${entry.rows}`).join(', ');
}

/**
 * Refuse a destructive command that would run against production, or against
 * a database that already holds real data.
 *
 * @throws {DestructiveCommandRefusedError} When the command must not run. The
 *   message states what was detected and what to do instead; a caller is
 *   expected to print it and exit non-zero rather than continue.
 */
export function assertDestructiveCommandAllowed(options: DestructiveCommandOptions): void {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const log = options.log ?? defaultLog;

  if (env['NODE_ENV'] === 'production') {
    throw new DestructiveCommandRefusedError(
      'production-environment',
      `Refusing to run ${options.command}: NODE_ENV is 'production'.\n` +
        `  Target: ${options.databasePath}\n` +
        '  This command destroys data and is for development and test only.\n' +
        '  FORCE=true does NOT lift this — run it against a development database instead.'
    );
  }

  const populated = populatedTables(options.connection, options.guardedTables);
  if (populated.length === 0) return;

  if (isForced(env, argv)) {
    log(
      `⚠️  ${options.command} is about to destroy data in ${options.databasePath} ` +
        `(${describe(populated)}). Proceeding because FORCE=true/--force was given.`
    );
    return;
  }

  throw new DestructiveCommandRefusedError(
    'populated-database',
    `Refusing to run ${options.command}: ${options.databasePath} already holds data ` +
      `(${describe(populated)}).\n` +
      '  A populated database is treated as production regardless of NODE_ENV — an imported\n' +
      '  real dataset looks exactly like this one.\n' +
      '  If you meant to reset a development database, re-run with FORCE=true (or --force).'
  );
}
