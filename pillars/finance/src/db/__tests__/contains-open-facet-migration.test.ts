/**
 * Migration test for 0079_contains_open_facet.
 *
 * The migration moves one column value, so the interesting cases are the rows
 * it must NOT move: the other closed facets keep their kind, and a row that
 * predates 0069's facet backfill has a null facet and is not a `contains` row
 * however its tag reads.
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
    join(here, '..', '..', '..', 'migrations', '0079_contains_open_facet.sql'),
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

describe('0079_contains_open_facet', () => {
  it('opens every contains value', () => {
    seed('contains:food', 'contains', 'closed');
    seed('contains:alcohol', 'contains', 'closed');

    raw.exec(MIGRATION);

    expect(kindOf('contains:food')).toBe('open');
    expect(kindOf('contains:alcohol')).toBe('open');
  });

  it('leaves the other closed facets closed', () => {
    seed('venue:bar', 'venue', 'closed');
    seed('occasion:out', 'occasion', 'closed');
    seed('channel:online', 'channel', 'closed');
    seed('fee:foreign', 'fee', 'closed');

    raw.exec(MIGRATION);

    expect(kindOf('venue:bar')).toBe('closed');
    expect(kindOf('occasion:out')).toBe('closed');
    expect(kindOf('channel:online')).toBe('closed');
    expect(kindOf('fee:foreign')).toBe('closed');
  });

  it('leaves markers and already-open facets alone', () => {
    seed('enrich:amazon', 'enrich', 'marker');
    seed('trip:tokyo', 'trip', 'open');

    raw.exec(MIGRATION);

    expect(kindOf('enrich:amazon')).toBe('marker');
    expect(kindOf('trip:tokyo')).toBe('open');
  });

  it('matches on the facet column, not on the tag string', () => {
    seed('contains:legacy', null, 'closed');

    raw.exec(MIGRATION);

    expect(kindOf('contains:legacy')).toBe('closed');
  });

  it('keeps every value and its usage count', () => {
    raw
      .prepare('INSERT INTO tag_vocabulary (tag, facet, kind, usage_count) VALUES (?, ?, ?, ?)')
      .run('contains:food', 'contains', 'closed', 42);

    raw.exec(MIGRATION);

    expect(raw.prepare('SELECT tag, usage_count FROM tag_vocabulary').all()).toEqual([
      { tag: 'contains:food', usage_count: 42 },
    ]);
  });
});
