/**
 * `db:clear:<id>` — wipe one pillar's development database, keep its schema.
 *
 * Post-monolith there is no shared `pops.db` and no global `db:clear`: every
 * pillar owns a file, so clearing is per pillar with an umbrella that fans
 * out (`--all`). There is deliberately no `db:init` companion — a pillar
 * creates and migrates its own file the first time it opens it, so a "fresh
 * database" is just an absent file.
 *
 * The destructive step is fronted by {@link assertDevDatabaseTarget}; see
 * `dev-db-guard.ts` for what it refuses and why.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { clearPillarTables, type ClearedTable } from './clear-pillar-tables.js';
import { assertDevDatabaseTarget } from './dev-db-guard.js';

const PILLAR_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;

export interface DbClearOptions {
  readonly pillarId: string;
  readonly repoRoot: string;
  /** Overrides the derived `pillars/<id>/data/<id>.db`. Guarded all the same. */
  readonly dbPath?: string;
  readonly env?: Record<string, string | undefined>;
  readonly log?: (message: string) => void;
}

export interface DbClearResult {
  readonly pillarId: string;
  readonly dbPath: string;
  /** True when the file did not exist — the pillar creates it on first boot. */
  readonly skipped: boolean;
  readonly cleared: readonly ClearedTable[];
}

/**
 * Every pillar that owns a database, discovered from disk by the presence of a
 * migration journal. Disk discovery keeps the umbrella task correct for
 * pillars that do not exist yet.
 */
export function discoverPillarIdsWithDatabases(repoRoot: string): string[] {
  const pillarsDir = join(repoRoot, 'pillars');
  if (!existsSync(pillarsDir)) return [];
  return readdirSync(pillarsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(join(pillarsDir, id, 'migrations')))
    .sort((a, b) => a.localeCompare(b));
}

export function defaultPillarDbPath(repoRoot: string, pillarId: string): string {
  return join(repoRoot, 'pillars', pillarId, 'data', `${pillarId}.db`);
}

export interface DbClearInvocation {
  /** Pillar ids to clear, already expanded when `--all` was passed. */
  readonly pillarIds: readonly string[];
  readonly dbPath?: string;
}

/**
 * Parse the CLI arguments: either one pillar id (optionally with an explicit
 * `--db <path>`) or `--all`, which expands to every pillar owning a database.
 */
export function parseDbClearArgv(argv: readonly string[], repoRoot: string): DbClearInvocation {
  const positional: string[] = [];
  let all = false;
  let dbPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg === '--db') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--db requires a path');
      dbPath = value;
      index += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith('-')) throw new Error(`unknown flag '${arg}'`);
    if (arg !== undefined) positional.push(arg);
  }

  if (all) {
    if (positional.length > 0) throw new Error('--all takes no pillar id');
    if (dbPath !== undefined) throw new Error('--all cannot be combined with --db');
    return { pillarIds: discoverPillarIdsWithDatabases(repoRoot) };
  }
  if (positional.length !== 1) {
    throw new Error('usage: db-clear <pillar-id> [--db <path>] | db-clear --all');
  }
  const [pillarId] = positional;
  if (pillarId === undefined) throw new Error('usage: db-clear <pillar-id> | db-clear --all');
  return dbPath === undefined ? { pillarIds: [pillarId] } : { pillarIds: [pillarId], dbPath };
}

export function runDbClear(options: DbClearOptions): DbClearResult {
  const { pillarId, repoRoot } = options;
  const log = options.log ?? ((message: string) => console.warn(message));

  if (!PILLAR_ID_PATTERN.test(pillarId)) {
    throw new Error(`invalid pillar id '${pillarId}': expected lowercase kebab-case`);
  }
  if (!existsSync(join(repoRoot, 'pillars', pillarId, 'migrations'))) {
    const known = discoverPillarIdsWithDatabases(repoRoot).join(', ');
    throw new Error(
      `pillar '${pillarId}' owns no database (no pillars/${pillarId}/migrations). Pillars with databases: ${known}`
    );
  }

  const requestedPath = options.dbPath ?? defaultPillarDbPath(repoRoot, pillarId);
  const dbPath = assertDevDatabaseTarget({ dbPath: requestedPath, repoRoot, env: options.env });

  if (!existsSync(dbPath)) {
    log(`↷ ${pillarId}: no database at ${dbPath} — nothing to clear (created on first boot)`);
    return { pillarId, dbPath, skipped: true, cleared: [] };
  }

  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const cleared = clearPillarTables(db);
    const rows = cleared.reduce((total, entry) => total + entry.deleted, 0);
    log(`✔ ${pillarId}: cleared ${rows} row(s) across ${cleared.length} table(s) in ${dbPath}`);
    return { pillarId, dbPath, skipped: false, cleared };
  } finally {
    db.close();
  }
}
