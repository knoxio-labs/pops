/**
 * Per-module migration runner (PRD-101 US-09, #2543).
 *
 * Drizzle's flat journal lives in `drizzle-migrations/meta/_journal.json` —
 * before PRD-101 every entry in that journal ran unconditionally on boot
 * regardless of which modules were installed. After PRD-101 each module
 * declares the migration tags it owns via `manifest.backend.migrations`;
 * the runner reads `installedManifests()`, builds the union of allowed
 * tags, and skips entries owned by absent modules.
 *
 * Backward compatibility: the runner records applied migrations under the
 * same `__drizzle_migrations` hash convention `drizzle-orm/migrator` uses,
 * so a database upgraded from the pre-PRD-101 runtime continues to work
 * untouched — every entry already in `__drizzle_migrations` is treated as
 * applied and no re-application is attempted.
 *
 * Skipped (absent-module) migrations are NOT recorded — re-enabling the
 * module on a subsequent boot brings them in naturally.
 *
 * Orphan warning: if `__drizzle_migrations` contains hashes for tags
 * whose owning module is now absent, the runner logs a warning naming each
 * orphan tag so operators can spot leftover data from previously-installed
 * modules. Orphan migrations are NEVER deleted — data is intact.
 *
 * Schema backfill: when a migration's statement throws `table X already
 * exists` / `duplicate column name` / similar, the runner treats that
 * statement as already-applied and continues. The hash is still recorded
 * so subsequent boots short-circuit. The tag is bucketed as `backfilled`
 * (not `applied`) so the operator can spot schema-vs-migration drift.
 * Only additive-DDL errors are accepted — inverse errors (`no such table`,
 * `no such column`) still crash the boot since they signal the migration's
 * preconditions are not actually met.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { isAlreadyAppliedError, splitStatements } from './migration-backfill.js';
import { DRIZZLE_MIGRATIONS_DIRECTORY } from './migrations-runner.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { ModuleManifest } from '@pops/types';

const journalEntrySchema = z.object({
  idx: z.number(),
  version: z.string(),
  when: z.number(),
  tag: z.string(),
  breakpoints: z.boolean(),
});

const journalSchema = z.object({
  version: z.string(),
  dialect: z.string(),
  entries: z.array(journalEntrySchema),
});

type Journal = z.infer<typeof journalSchema>;

/**
 * Read the drizzle journal. Returns an empty entry list if the file is
 * missing, so the runner is safe on a brand-new repo with no drizzle
 * artefacts yet.
 */
export function readJournal(): Journal {
  const journalPath = join(DRIZZLE_MIGRATIONS_DIRECTORY, 'meta', '_journal.json');
  let raw: string;
  try {
    raw = readFileSync(journalPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: '7', dialect: 'sqlite', entries: [] };
    }
    throw err;
  }
  const parsed = journalSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid drizzle journal at ${journalPath}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Build the union of migration ids declared by every installed module's
 * `manifest.backend.migrations` plus core's. Returns a Set for O(1)
 * membership lookup.
 */
export function installedMigrationTags(manifests: readonly ModuleManifest[]): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const m of manifests) {
    for (const migration of m.backend?.migrations ?? []) {
      tags.add(migration.id);
    }
  }
  return tags;
}

/**
 * Build the inverse mapping: migration tag → owning module id. Used to
 * warn about orphan migrations (recorded in `__drizzle_migrations` but
 * owned by a module that isn't installed) and to distinguish "skipped"
 * tags (known but absent module) from "unowned" tags (no module claims
 * the tag at all).
 *
 * Multiple modules MUST NOT own the same migration tag. The build-time
 * registry guard (US-11) is the primary catch, but we fail fast here
 * too so any runtime drift between the static map and the live manifest
 * graph surfaces as a hard error instead of silently letting the last
 * manifest win (which would mis-attribute a migration and break the
 * install-set filter).
 */
export function migrationOwnershipMap(
  manifests: readonly ModuleManifest[]
): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const m of manifests) {
    for (const migration of m.backend?.migrations ?? []) {
      const existingOwner = owners.get(migration.id);
      if (existingOwner !== undefined) {
        throw new Error(
          `Migration tag "${migration.id}" is declared by both "${existingOwner}" and "${m.id}".`
        );
      }
      owners.set(migration.id, m.id);
    }
  }
  return owners;
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
  const rows = db.prepare('SELECT hash FROM __drizzle_migrations').all() as {
    hash: string;
  }[];
  return new Set(rows.map((r) => r.hash));
}

function readMigrationSql(tag: string): string {
  return readFileSync(join(DRIZZLE_MIGRATIONS_DIRECTORY, `${tag}.sql`), 'utf8');
}

/**
 * Drizzle's hashing function. `drizzle-orm/migrator` records each applied
 * migration as `sha256(sql)`. We reproduce the same hash here so a DB
 * upgraded from the pre-PRD-101 runtime keeps working unchanged.
 */
function hashSql(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Result returned by {@link runPerModuleMigrations}. Distinguishes applied,
 * skipped (owned by an absent module), and orphan (already-applied but
 * owner not installed) tags so callers (tests, observability) can assert
 * the filter worked.
 */
export interface PerModuleMigrationResult {
  /** Tags applied during this run (newly inserted into __drizzle_migrations). */
  applied: readonly string[];
  /**
   * Tags whose hash was newly inserted but at least one statement was
   * skipped because the schema already had its effect (e.g. a `CREATE TABLE`
   * for a table that already exists). The migration completed and the hash
   * was recorded, but the schema diverged from the migration's intent — an
   * operator should reconcile.
   */
  backfilled: readonly string[];
  /** Tags skipped because no installed module owns them. */
  skipped: readonly string[];
  /** Tags whose owner is unknown — there's no manifest claiming them. */
  unowned: readonly string[];
  /** Tags whose hash is already recorded — no action taken. */
  alreadyApplied: readonly string[];
}

type ApplyOutcome = 'applied' | 'backfilled';

interface ApplyMigrationArgs {
  db: BetterSqlite3.Database;
  tag: string;
  sql: string;
  hash: string;
  insert: BetterSqlite3.Statement;
}

/**
 * Apply one migration's SQL inside a transaction. Per-statement errors
 * matching the "already applied" patterns (see `migration-backfill.ts`)
 * are caught and logged; any other error aborts the transaction. Returns
 * `backfilled` if at least one statement was skipped — useful so callers
 * can surface schema-vs-migration drift to the operator.
 */
function applyMigration({ db, tag, sql, hash, insert }: ApplyMigrationArgs): ApplyOutcome {
  let didBackfill = false;
  db.transaction(() => {
    for (const stmt of splitStatements(sql)) {
      try {
        db.exec(stmt);
      } catch (err) {
        if (!isAlreadyAppliedError(err)) throw err;
        didBackfill = true;
        logger.info(
          {
            migrationTag: tag,
            statementPreview: stmt.slice(0, 80),
            sqliteError: (err as Error).message,
          },
          `[db] Migration "${tag}" statement already applied to schema — recording hash without re-running.`
        );
      }
    }
    insert.run(hash, Date.now());
  })();
  return didBackfill ? 'backfilled' : 'applied';
}

/**
 * Apply the drizzle migration set, filtered by the install set.
 *
 * - Entries already in `__drizzle_migrations` (by SHA-256 hash) are
 *   left untouched.
 * - Entries whose owning module is not installed are skipped — nothing
 *   is recorded so they re-run on a future boot when the module appears.
 * - Entries with no declared owner are also skipped and reported via
 *   the `unowned` field on the result, so the contract guard (US-11)
 *   can flag missing ownership declarations.
 *
 * The `knownOwners` argument is the canonical owner map covering every
 * buildable module (whether installed or not). It is used to distinguish
 * "skipped" tags (owned by a known but absent module) from "unowned"
 * tags (no manifest claims the tag at all). When omitted, ownership is
 * derived from the installed manifests only — meaning every tag owned
 * by an absent module is treated as `unowned`.
 *
 * Returns a typed breakdown of what happened. Callers may inspect
 * `applied` / `skipped` / `unowned` / `alreadyApplied` to assert
 * behaviour from tests.
 */
export function runPerModuleMigrations(
  db: BetterSqlite3.Database,
  manifests: readonly ModuleManifest[],
  knownOwners?: ReadonlyMap<string, string>
): PerModuleMigrationResult {
  const owners = knownOwners ?? migrationOwnershipMap(manifests);
  const installedTags = installedMigrationTags(manifests);
  const installedIds = new Set(manifests.map((m) => m.id));
  return runPerModuleMigrationsByOwner(db, installedIds, owners, installedTags);
}

/**
 * Boot-time variant used by `db.ts`. Mirrors {@link warnOrphanMigrationsByOwner}:
 * the live manifest graph cannot be imported during database bootstrap
 * (manifests transitively pull `db.ts` via their tRPC routers), so callers
 * supply the install-set of module ids and the canonical ownership map
 * (from `migration-ownership.ts`) directly.
 *
 * Optionally pass `installedTags` to enforce the manifest-level "tag is
 * declared by an installed module's manifest" guard. When omitted, every
 * tag whose owner is installed is treated as installed too — the static
 * ownership map is authoritative.
 */
export function runPerModuleMigrationsByOwner(
  db: BetterSqlite3.Database,
  installedIds: ReadonlySet<string>,
  owners: ReadonlyMap<string, string>,
  installedTags?: ReadonlySet<string>
): PerModuleMigrationResult {
  ensureDrizzleTable(db);

  const journal = readJournal();

  const applied: string[] = [];
  const backfilled: string[] = [];
  const skipped: string[] = [];
  const unowned: string[] = [];
  const alreadyApplied: string[] = [];

  const knownHashes = appliedHashes(db);
  const insert = db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)');

  for (const entry of journal.entries) {
    // Classify ownership BEFORE the hash short-circuit. If we checked the
    // hash first, a duplicate-SQL entry owned by an absent or unknown
    // module would be silently bucketed as `alreadyApplied` — hiding the
    // manifest/ownership drift this result is meant to surface. Ownership
    // classification is the authoritative signal; hash equality only
    // matters once we've confirmed the tag belongs to the install set.
    const owner = owners.get(entry.tag);
    if (owner === undefined) {
      // No declared owner — treat as absent and warn. This is a contract
      // violation; CI (US-11) should catch it, but we don't want a missing
      // ownership entry to silently apply migrations to a partial install.
      unowned.push(entry.tag);
      continue;
    }
    if (!installedIds.has(owner)) {
      skipped.push(entry.tag);
      continue;
    }
    if (installedTags !== undefined && !installedTags.has(entry.tag)) {
      // Owner is installed but manifest doesn't list the tag — possible
      // if the ownership map and manifest disagree. Skip defensively.
      skipped.push(entry.tag);
      continue;
    }

    const sql = readMigrationSql(entry.tag);
    const hash = hashSql(sql);

    if (knownHashes.has(hash)) {
      alreadyApplied.push(entry.tag);
      continue;
    }

    const outcome = applyMigration({ db, tag: entry.tag, sql, hash, insert });
    // Keep the applied-hash cache in sync so subsequent journal entries
    // with the same SQL body (e.g. idempotent re-creation migrations) are
    // recognised as already applied within this same boot.
    knownHashes.add(hash);
    (outcome === 'backfilled' ? backfilled : applied).push(entry.tag);
  }

  return { applied, backfilled, skipped, unowned, alreadyApplied };
}

// Orphan-migration warning is split into `./migration-orphan-warn.js` to
// keep this file under the per-file line cap. Re-exported here so existing
// import paths keep working.
export { warnOrphanMigrations, warnOrphanMigrationsByOwner } from './migration-orphan-warn.js';
