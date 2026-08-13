/**
 * Reading a drizzle migrations journal, and deciding what a database still
 * has to apply from it — without running anything.
 *
 * The answer has to match drizzle's own migrator exactly, because the
 * pre-migration backup is sized by it: drizzle records one row per applied
 * entry in `__drizzle_migrations` and, on the next open, applies every journal
 * entry whose `when` is newer than the newest `created_at` it finds there.
 * Anything laxer here would take a snapshot on every boot; anything stricter
 * would skip one on the boot that needed it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { SqliteConnection } from './connection.js';

/**
 * Loose on purpose: `version` and `breakpoints` are drizzle's, this module
 * has no use for them, and an entry copied into a staged folder by
 * `stageMigrationsThrough` has to arrive at the real migrator with every
 * field it shipped with.
 */
const journalSchema = z.object({
  entries: z.array(
    z.looseObject({
      idx: z.number(),
      when: z.number(),
      tag: z.string(),
    })
  ),
});

/** One entry of `migrations/meta/_journal.json`. */
export type MigrationJournalEntry = z.infer<typeof journalSchema>['entries'][number];

/** Path of the journal file inside a migrations folder. */
export function journalPath(migrationsFolder: string): string {
  return join(migrationsFolder, 'meta', '_journal.json');
}

/**
 * Parse `migrations/meta/_journal.json`, ordered oldest entry first.
 *
 * @throws When the file is missing or does not carry the fields the migrator
 *   needs — both are deploy-time misconfigurations that must not be swallowed
 *   into "no migrations pending".
 */
export function readMigrationJournal(migrationsFolder: string): MigrationJournalEntry[] {
  const raw: unknown = JSON.parse(readFileSync(journalPath(migrationsFolder), 'utf8'));
  return [...journalSchema.parse(raw).entries].sort((a, b) => a.when - b.when);
}

/**
 * The timestamp of the newest migration this database has recorded, or
 * `undefined` when it has recorded none (including when drizzle has never run
 * against it and the bookkeeping table does not exist yet).
 */
export function lastAppliedMigrationAt(connection: SqliteConnection): number | undefined {
  const table = connection
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`
    )
    .get();
  if (table === undefined) return undefined;
  const row = connection
    .prepare(`SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`)
    .get() as { created_at: unknown } | undefined;
  if (row === undefined) return undefined;
  const createdAt = Number(row.created_at);
  return Number.isFinite(createdAt) ? createdAt : undefined;
}

/**
 * The journal entries `migrate()` would apply to this database right now.
 *
 * Mirrors drizzle's `created_at < folderMillis` comparison, so an entry whose
 * `when` equals the recorded timestamp counts as already applied.
 */
export function pendingMigrations(
  connection: SqliteConnection,
  migrationsFolder: string
): MigrationJournalEntry[] {
  const entries = readMigrationJournal(migrationsFolder);
  const appliedAt = lastAppliedMigrationAt(connection);
  if (appliedAt === undefined) return entries;
  return entries.filter((entry) => entry.when > appliedAt);
}
