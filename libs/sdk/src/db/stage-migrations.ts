/**
 * A migrations folder as it stood at some earlier entry.
 *
 * The only way to prove a migration is safe for data that already exists is
 * to bring a database up to the entry before it, put rows in, and then let the
 * real migrator run the rest — which needs a journal truncated at that point,
 * because drizzle applies a folder wholesale. Test-only, and shipped from here
 * rather than copied into each pillar's suite: every pillar that grows a
 * data-safety test needs the identical thirty lines.
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { journalPath, readMigrationJournal } from './migration-journal.js';

/** Inputs to {@link stageMigrationsThrough}. */
export interface StageMigrationsOptions {
  /** The pillar's real migrations folder. */
  readonly migrationsFolder: string;
  /** Tag of the last entry to include, e.g. `0001_purchase_tags`. */
  readonly through: string;
  /** Directory to write the truncated folder into. Created if missing. */
  readonly targetFolder: string;
}

/**
 * Write a copy of `migrationsFolder` holding only the entries up to and
 * including `through`, and return its path.
 *
 * @throws When `through` names no entry in the journal — a renamed migration
 *   would otherwise silently stage a folder ending wherever the sort landed,
 *   and the test built on it would assert nothing.
 */
export function stageMigrationsThrough(options: StageMigrationsOptions): string {
  const entries = readMigrationJournal(options.migrationsFolder);
  const cut = entries.findIndex((entry) => entry.tag === options.through);
  if (cut === -1) {
    throw new Error(
      `no migration tagged "${options.through}" in ${journalPath(options.migrationsFolder)}`
    );
  }
  const staged = entries.slice(0, cut + 1);
  mkdirSync(join(options.targetFolder, 'meta'), { recursive: true });
  for (const entry of staged) {
    cpSync(
      join(options.migrationsFolder, `${entry.tag}.sql`),
      join(options.targetFolder, `${entry.tag}.sql`)
    );
  }
  writeFileSync(
    journalPath(options.targetFolder),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries: staged })
  );
  return options.targetFolder;
}
