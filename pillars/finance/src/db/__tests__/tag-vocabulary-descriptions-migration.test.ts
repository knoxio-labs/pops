/**
 * Migration test for 0104_tag_vocabulary_descriptions.
 *
 * The migration adds a nullable column and fills it for a chosen subset. The
 * cases worth asserting are the subset boundary, not the happy path: a value
 * the migration does not name must stay null (the column is optional by
 * design — POPS-3285), and a value the vocabulary does not hold must not be
 * conjured into existence by an UPDATE that matches nothing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** `tag_vocabulary` as 0103 leaves it — no `description` column. */
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

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0104_tag_vocabulary_descriptions.sql'
  ),
  'utf8'
);

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(PRE_MIGRATION_DDL);
});

afterEach(() => {
  raw.close();
});

function seed(tag: string): void {
  const [facet] = tag.split(':');
  raw.prepare('INSERT INTO tag_vocabulary (tag, facet) VALUES (?, ?)').run(tag, facet ?? null);
}

function descriptionOf(tag: string): string | null | undefined {
  const row = raw.prepare('SELECT description FROM tag_vocabulary WHERE tag = ?').get(tag) as
    | { description: string | null }
    | undefined;
  return row?.description;
}

describe('0104_tag_vocabulary_descriptions', () => {
  it('describes every occasion value, which is the axis the model was guessing on', () => {
    for (const value of ['out', 'home', 'travel', 'work', 'health']) seed(`occasion:${value}`);

    raw.exec(MIGRATION);

    for (const value of ['out', 'home', 'travel', 'work', 'health']) {
      expect(descriptionOf(`occasion:${value}`)).toEqual(expect.any(String));
    }
  });

  it('says what occasion:home is NOT, since the word alone is what collected the wrong rows', () => {
    seed('occasion:home');

    raw.exec(MIGRATION);

    expect(descriptionOf('occasion:home')).toContain('NOT goods that merely end up at home');
  });

  it('separates homewares from hardware rather than widening it', () => {
    seed('venue:homewares');

    raw.exec(MIGRATION);

    expect(descriptionOf('venue:homewares')).toContain('Not a hardware or building-supplies store');
  });

  it('leaves a value it does not name null rather than inventing filler', () => {
    seed('trip:cairns-2026');
    seed('venue:bakery');

    raw.exec(MIGRATION);

    expect(descriptionOf('trip:cairns-2026')).toBeNull();
    expect(descriptionOf('venue:bakery')).toBeNull();
  });

  it('creates no row for a value the vocabulary does not hold', () => {
    seed('occasion:home');

    raw.exec(MIGRATION);

    expect(descriptionOf('occasion:health')).toBeUndefined();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM tag_vocabulary').get()).toEqual({ n: 1 });
  });

  it('rewrites the same text on a second run of its updates', () => {
    seed('occasion:home');
    raw.exec(MIGRATION);
    const first = descriptionOf('occasion:home');

    raw.exec(
      MIGRATION.split('\n')
        .filter((line) => !line.startsWith('ALTER TABLE'))
        .join('\n')
    );

    expect(descriptionOf('occasion:home')).toBe(first);
  });
});
