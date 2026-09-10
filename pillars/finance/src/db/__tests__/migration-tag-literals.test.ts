/**
 * Every `facet:value` a migration writes must be one the vocabulary holds
 * (POPS-3301).
 *
 * 0105 appends `occasion:health` to pharmacy rows. That value existed in the
 * live database and not in one built from this chain, so without an explicit
 * insert the migration would have put a tag on a transaction that the closed
 * set did not contain — the inconsistency POPS-2606 removed — and the value
 * would then have been dropped from every prompt built afterwards. A test
 * caught that one by accident while asserting something else. This is the
 * structural version.
 *
 * Static rather than stepwise: it scans each migration's SQL for the tag
 * literals it writes and checks them against the vocabulary the whole chain
 * produces. That is weaker than replaying the chain migration by migration —
 * it would not catch a value seeded *after* the migration that writes it — but
 * it is the check that has no false positives and needs no fixture, and the
 * ordering hazard is covered by the fact that a migration writing a tag reads
 * as obviously wrong beside a later seed. A retired value still passes,
 * deliberately: retirement deactivates the row (0071, 0073) rather than
 * deleting it, so `occasion:admin` is still held.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TAG_FACET_KINDS } from '../tag-facets.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'migrations'
);

interface JournalEntry {
  tag: string;
}

function migrationFiles(): string[] {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')
  ) as { entries: JournalEntry[] };
  return journal.entries.map((entry) => entry.tag);
}

const FACETS = Object.keys(TAG_FACET_KINDS);
const TAG_LITERAL = new RegExp(`'((?:${FACETS.join('|')}):[a-z0-9][a-z0-9-]*)'`, 'gu');

/** Strip `--` line comments so a tag named only in prose is not read as written. */
function sqlWithoutComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function tagLiteralsIn(sql: string): string[] {
  return [...new Set([...sqlWithoutComments(sql).matchAll(TAG_LITERAL)].map((m) => m[1] ?? ''))];
}

describe('tag literals in migration SQL', () => {
  it('finds tag literals at all, so a silent regex miss cannot make this vacuous', () => {
    const all = migrationFiles().flatMap((name) =>
      tagLiteralsIn(readFileSync(join(MIGRATIONS_DIR, `${name}.sql`), 'utf8'))
    );

    expect(all).toContain('occasion:health');
    expect(all).toContain('venue:hardware');
    expect(all.length).toBeGreaterThan(20);
  });

  it('ignores a tag named only in a comment', () => {
    expect(tagLiteralsIn("-- retires 'occasion:admin'\nSELECT 1;")).toEqual([]);
    expect(tagLiteralsIn("UPDATE t SET x = 'occasion:admin';")).toEqual(['occasion:admin']);
  });

  it('holds every tag literal any migration writes in the migrated vocabulary', () => {
    const { raw } = freshMigratedFinanceDb();
    const held = new Set(
      (raw.prepare('SELECT tag FROM tag_vocabulary').all() as { tag: string }[]).map(
        (row) => row.tag
      )
    );

    const missing: string[] = [];
    for (const name of migrationFiles()) {
      for (const tag of tagLiteralsIn(readFileSync(join(MIGRATIONS_DIR, `${name}.sql`), 'utf8'))) {
        if (!held.has(tag)) missing.push(`${name}: ${tag}`);
      }
    }

    expect(missing).toEqual([]);
  });
});
