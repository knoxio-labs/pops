/**
 * Migration test for 0120_venue_occasion_open_facets (POPS-3951).
 *
 * Mirrors 0079's own test: the migration moves one column value on two
 * facets, so the interesting cases are the rows it must NOT move — the other
 * closed facets keep their kind, and a row that predates 0069's facet
 * backfill has a null facet and is not a `venue`/`occasion` row however its
 * tag reads.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** `tag_vocabulary` as 0069 leaves it. */
const PRE_MIGRATION_DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  kind text NOT NULL DEFAULT 'open',
  source text DEFAULT 'seed' NOT NULL,
  is_active integer DEFAULT 1 NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  created_at text DEFAULT (datetime('now')) NOT NULL
);
`;

function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(here, '..', '..', '..', 'migrations', '0120_venue_occasion_open_facets.sql'),
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

function seed(tag: string, facet: string | null, kind: string): void {
  raw
    .prepare('INSERT INTO tag_vocabulary (tag, facet, kind) VALUES (?, ?, ?)')
    .run(tag, facet, kind);
}

function kindOf(tag: string): string | undefined {
  const row = raw.prepare('SELECT kind FROM tag_vocabulary WHERE tag = ?').get(tag) as
    | { kind: string }
    | undefined;
  return row?.kind;
}

function runMigration(): number {
  return raw.prepare(MIGRATION).run().changes;
}

describe('0120_venue_occasion_open_facets', () => {
  it('opens every venue and occasion value', () => {
    seed('venue:fishmonger', 'venue', 'closed');
    seed('occasion:moving', 'occasion', 'closed');

    runMigration();

    expect(kindOf('venue:fishmonger')).toBe('open');
    expect(kindOf('occasion:moving')).toBe('open');
  });

  it('leaves the other closed facets closed', () => {
    seed('channel:online', 'channel', 'closed');
    seed('fee:foreign', 'fee', 'closed');

    runMigration();

    expect(kindOf('channel:online')).toBe('closed');
    expect(kindOf('fee:foreign')).toBe('closed');
  });

  it('leaves markers and already-open facets alone', () => {
    seed('flag:needs-review', 'flag', 'marker');
    seed('trip:tokyo', 'trip', 'open');
    seed('contains:food', 'contains', 'open');

    runMigration();

    expect(kindOf('flag:needs-review')).toBe('marker');
    expect(kindOf('trip:tokyo')).toBe('open');
    expect(kindOf('contains:food')).toBe('open');
  });

  it('matches on the facet column, not on the tag string', () => {
    seed('venue:legacy', null, 'closed');

    runMigration();

    expect(kindOf('venue:legacy')).toBe('closed');
  });

  it('keeps every value and its usage count', () => {
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, facet, kind, usage_count) VALUES (?, ?, ?, ?)')
      .run('venue:fishmonger', 'venue', 'closed', 7);

    runMigration();

    expect(raw.prepare('SELECT tag, usage_count FROM tag_vocabulary').all()).toEqual([
      { tag: 'venue:fishmonger', usage_count: 7 },
    ]);
  });

  it('is idempotent: a second run writes no row', () => {
    seed('venue:fishmonger', 'venue', 'closed');
    seed('occasion:moving', 'occasion', 'closed');
    seed('venue:bar', 'venue', 'open');
    seed('channel:online', 'channel', 'closed');

    expect(runMigration()).toBe(2);
    const afterFirst = raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all();

    expect(runMigration()).toBe(0);
    expect(raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all()).toEqual(afterFirst);
  });
});
