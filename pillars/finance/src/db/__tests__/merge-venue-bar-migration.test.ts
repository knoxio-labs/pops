/**
 * Migration test for 0075_merge_venue_bar_into_pub (POPS-2607).
 *
 * The case that decides whether the migration is worth anything is the row
 * carrying both values: mapping `venue:bar` onto `venue:pub` there would create
 * a duplicate — a fresh cardinality violation made while fixing one — so the
 * rewrite has to deduplicate rather than substitute.
 *
 * Tables are pinned by hand rather than seeded through the journal, matching
 * 0067/0069/0071's tests: seeding through the journal would hand the migration
 * its own output.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PRE_MIGRATION_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_tag_rules (
  id text PRIMARY KEY NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE transaction_corrections (
  id text PRIMARY KEY NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0075_merge_venue_bar_into_pub.sql'),
    'utf8'
  );
}

const MIGRATION = migrationSql();

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seed(table: string, id: string, tags: readonly string[]): void {
  raw.prepare(`INSERT INTO ${table} (id, tags) VALUES (?, ?)`).run(id, JSON.stringify(tags));
}

function seedVocabulary(tag: string, usageCount: number): void {
  raw.prepare('INSERT INTO tag_vocabulary (tag, usage_count) VALUES (?, ?)').run(tag, usageCount);
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

function tagsOf(table: string, id: string): string[] {
  const row = raw.prepare(`SELECT tags FROM ${table} WHERE id = ?`).get(id) as
    | { tags: string }
    | undefined;
  if (!row) throw new Error(`${table} ${id} vanished`);
  return JSON.parse(row.tags) as string[];
}

function vocabulary(tag: string): { is_active: number; usage_count: number } {
  const row = raw
    .prepare('SELECT is_active, usage_count FROM tag_vocabulary WHERE tag = ?')
    .get(tag) as { is_active: number; usage_count: number } | undefined;
  if (!row) throw new Error(`vocabulary ${tag} vanished`);
  return row;
}

describe('0075 — the rewrite', () => {
  it('maps venue:bar onto venue:pub and leaves the other tags alone', () => {
    seed('transactions', 't1', ['venue:bar', 'occasion:out', 'contains:alcohol']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['venue:pub', 'occasion:out', 'contains:alcohol']);
  });

  it('collapses a row carrying BOTH rather than creating a duplicate', () => {
    seed('transactions', 't1', ['venue:bar', 'venue:pub', 'occasion:out']);

    migrate();

    const tags = tagsOf('transactions', 't1');
    expect(tags.filter((t) => t === 'venue:pub')).toHaveLength(1);
    expect(tags).toEqual(['venue:pub', 'occasion:out']);
  });

  it('leaves a venue:pub-only row untouched', () => {
    seed('transactions', 't1', ['venue:pub', 'contains:food']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['venue:pub', 'contains:food']);
  });

  it('leaves a row with no venue at all untouched', () => {
    seed('transactions', 't1', ['contains:alcohol']);

    migrate();

    expect(tagsOf('transactions', 't1')).toEqual(['contains:alcohol']);
  });

  it('rewrites tag rules, or the next re-evaluation writes the value back', () => {
    seed('transaction_tag_rules', 'r1', ['venue:bar', 'contains:food']);
    seed('transaction_tag_rules', 'r2', ['venue:bar', 'venue:pub']);

    migrate();

    expect(tagsOf('transaction_tag_rules', 'r1')).toEqual(['venue:pub', 'contains:food']);
    expect(tagsOf('transaction_tag_rules', 'r2')).toEqual(['venue:pub']);
  });

  it('rewrites correction rules too', () => {
    seed('transaction_corrections', 'c1', ['venue:bar']);

    migrate();

    expect(tagsOf('transaction_corrections', 'c1')).toEqual(['venue:pub']);
  });
});

describe('0075 — the vocabulary', () => {
  it('carries the retired usage onto the survivor rather than restarting it', () => {
    seedVocabulary('venue:bar', 40);
    seedVocabulary('venue:pub', 9);

    migrate();

    expect(vocabulary('venue:pub')).toEqual({ is_active: 1, usage_count: 49 });
    expect(vocabulary('venue:bar')).toEqual({ is_active: 0, usage_count: 0 });
  });

  it('leaves an unrelated vocabulary row alone', () => {
    seedVocabulary('venue:bar', 40);
    seedVocabulary('venue:pub', 9);
    seedVocabulary('venue:restaurant', 31);

    migrate();

    expect(vocabulary('venue:restaurant')).toEqual({ is_active: 1, usage_count: 31 });
  });
});

describe('0075 — idempotency', () => {
  it('does not double-count the usage transfer on a second run', () => {
    seedVocabulary('venue:bar', 40);
    seedVocabulary('venue:pub', 9);
    seed('transactions', 't1', ['venue:bar', 'venue:pub']);
    seed('transaction_tag_rules', 'r1', ['venue:bar']);

    migrate();
    const afterFirst = {
      t1: tagsOf('transactions', 't1'),
      r1: tagsOf('transaction_tag_rules', 'r1'),
      pub: vocabulary('venue:pub'),
      bar: vocabulary('venue:bar'),
    };

    migrate();

    expect({
      t1: tagsOf('transactions', 't1'),
      r1: tagsOf('transaction_tag_rules', 'r1'),
      pub: vocabulary('venue:pub'),
      bar: vocabulary('venue:bar'),
    }).toEqual(afterFirst);
  });
});
