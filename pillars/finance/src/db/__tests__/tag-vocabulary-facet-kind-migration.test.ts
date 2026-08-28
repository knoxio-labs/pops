/**
 * Migration test for 0069_tag_vocabulary_facet_kind (POPS-2606).
 *
 * Starts from the shape `tag_vocabulary` had before the columns existed, so the
 * derivation is proved rather than assumed. The tables are pinned by hand for
 * the same reason 0067's test pins them — seeding through the journal would
 * hand the migration its own output.
 *
 * The distinction the migration turns on: `facet` is derived from the tag
 * string, `kind` is not. Nothing in `trip:hunter-valley-2026` says whether
 * `trip` is open or closed, so the kind is written out by facet name, and the
 * tests below check that policy rather than a pattern.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The shape the two tables had before 0069 ran. */
const PRE_MIGRATION_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  tags text DEFAULT '[]' NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0069_tag_vocabulary_facet_kind.sql'),
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

function seedVocabulary(...tags: readonly string[]): void {
  const insert = raw.prepare('INSERT INTO tag_vocabulary (tag) VALUES (?)');
  for (const tag of tags) insert.run(tag);
}

function seedTransaction(id: string, tags: readonly string[]): void {
  raw.prepare('INSERT INTO transactions (id, tags) VALUES (?, ?)').run(id, JSON.stringify(tags));
}

function migrate(): void {
  raw.transaction(() => raw.exec(MIGRATION))();
}

function rowOf(tag: string): { facet: string | null; kind: string; usage_count: number } {
  return raw
    .prepare('SELECT facet, kind, usage_count FROM tag_vocabulary WHERE tag = ?')
    .get(tag) as {
    facet: string | null;
    kind: string;
    usage_count: number;
  };
}

describe('0069 — facet derivation', () => {
  it('splits the prefix off every namespaced tag', () => {
    seedVocabulary('venue:bar', 'contains:public-transport', 'trip:hunter-valley-2026');

    migrate();

    expect(rowOf('venue:bar').facet).toBe('venue');
    expect(rowOf('contains:public-transport').facet).toBe('contains');
    expect(rowOf('trip:hunter-valley-2026').facet).toBe('trip');
  });

  it('leaves an unprefixed legacy tag with no facet', () => {
    seedVocabulary('Groceries');

    migrate();

    expect(rowOf('Groceries').facet).toBeNull();
  });

  it('does not treat a leading or trailing colon as a facet', () => {
    seedVocabulary(':leading', 'trailing:');

    migrate();

    expect(rowOf(':leading').facet).toBeNull();
    expect(rowOf('trailing:').facet).toBeNull();
  });

  it('splits on the first colon only, so a value may contain one', () => {
    seedVocabulary('trip:tokyo:2026');

    migrate();

    expect(rowOf('trip:tokyo:2026').facet).toBe('trip');
  });
});

describe('0069 — kind is policy, not pattern', () => {
  it.each([
    ['venue:bar', 'closed'],
    ['occasion:out', 'closed'],
    ['contains:food', 'closed'],
    ['channel:online', 'closed'],
    ['fee:interest', 'closed'],
    ['trip:hunter-valley-2026', 'open'],
    ['asset:homelab', 'open'],
    ['hobby:brewing', 'open'],
    ['tax:deductible', 'open'],
    ['enrich:amazon', 'marker'],
    ['person:rosane', 'marker'],
    ['flag:needs-review', 'marker'],
  ])('classifies %s as %s', (tag, kind) => {
    seedVocabulary(tag);

    migrate();

    expect(rowOf(tag).kind).toBe(kind);
  });

  it('defaults an unrecognised facet to open, never closed', () => {
    seedVocabulary('vibe:cosy');

    migrate();

    expect(rowOf('vibe:cosy').kind).toBe('open');
  });

  it('defaults an unprefixed legacy tag to open, never closed', () => {
    seedVocabulary('Groceries');

    migrate();

    expect(rowOf('Groceries').kind).toBe('open');
  });

  it('classifies project, which has no values in live data, from the policy list', () => {
    seedVocabulary('project:deck');

    migrate();

    expect(rowOf('project:deck').kind).toBe('open');
  });
});

describe('0069 — usage backfill', () => {
  it('counts the transactions carrying each tag', () => {
    seedVocabulary('contains:coffee', 'venue:bar');
    seedTransaction('a', ['contains:coffee']);
    seedTransaction('b', ['contains:coffee', 'venue:bar']);
    seedTransaction('c', ['contains:coffee']);

    migrate();

    expect(rowOf('contains:coffee').usage_count).toBe(3);
    expect(rowOf('venue:bar').usage_count).toBe(1);
  });

  it('leaves an unused vocabulary tag at zero', () => {
    seedVocabulary('venue:sauna');
    seedTransaction('a', ['contains:coffee']);

    migrate();

    expect(rowOf('venue:sauna').usage_count).toBe(0);
  });

  it('does not add a vocabulary row for a tag only a transaction carries', () => {
    seedVocabulary('venue:bar');
    seedTransaction('a', ['venue:casino']);

    migrate();

    const count = raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get() as { n: number };
    expect(count.n).toBe(1);
  });
});
