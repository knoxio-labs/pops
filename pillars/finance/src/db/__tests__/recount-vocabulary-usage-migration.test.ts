/**
 * Migration test for 0114_recount_vocabulary_usage.
 *
 * `usage_count` is meant to track `applyVocabularyUsageDelta`'s bookkeeping,
 * but every migration that rewrites `transactions.tags` by hand has had to
 * keep it in step itself, and nothing catches a caller that forgets. These
 * cases are the ones a delta-based or non-distinct recount would get wrong:
 * a stored count with no evidence left for it, a tag two rows never mentioned,
 * and a transaction that carries the same tag twice.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const DDL = `
CREATE TABLE tag_vocabulary (
  tag text PRIMARY KEY NOT NULL,
  facet text,
  usage_count integer NOT NULL DEFAULT 0
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  tags text NOT NULL DEFAULT '[]'
);
`;

const MIGRATION = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0114_recount_vocabulary_usage.sql'
  ),
  'utf8'
);

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(DDL);
});

afterEach(() => {
  raw.close();
});

function vocab(tag: string, facet: string, usageCount: number): void {
  raw
    .prepare('INSERT INTO tag_vocabulary (tag, facet, usage_count) VALUES (?, ?, ?)')
    .run(tag, facet, usageCount);
}

function txn(id: string, tags: string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, tags) VALUES (?, ?, ?)')
    .run(id, id.toUpperCase(), JSON.stringify(tags));
}

function usageOf(tag: string): number {
  const row = raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as {
    usage_count: number;
  };
  return row.usage_count;
}

describe('0114_recount_vocabulary_usage', () => {
  it('recounts a value with a wrong stored count up to what the rows actually show', () => {
    vocab('venue:gym', 'venue', 999);
    txn('t1', ['venue:gym']);
    txn('t2', ['venue:gym']);

    raw.exec(MIGRATION);

    expect(usageOf('venue:gym')).toBe(2);
  });

  it('counts a tag carried twice on the same transaction once, not twice', () => {
    vocab('venue:gym', 'venue', 0);
    txn('t1', ['venue:gym', 'venue:gym']);

    raw.exec(MIGRATION);

    // A plain COUNT(*) over json_each would see the tag twice on t1 and land
    // on 2. The dedup that applyVocabularyUsageDelta performs with a Set
    // means a transaction using a tag twice still used it once.
    expect(usageOf('venue:gym')).toBe(1);
  });

  it('does not count an untagged row at all', () => {
    vocab('fee:account-keeping', 'fee', 5);
    txn('t1', []);
    txn('t2', ['fee:account-keeping']);

    raw.exec(MIGRATION);

    expect(usageOf('fee:account-keeping')).toBe(1);
  });

  it('zeroes a tag whose stored count has no transaction carrying it', () => {
    vocab('fee:account-keeping', 'fee', 7);
    txn('t1', ['venue:gym']);

    raw.exec(MIGRATION);

    expect(usageOf('fee:account-keeping')).toBe(0);
  });

  it('recounts every row independently in one pass', () => {
    vocab('venue:gym', 'venue', 1);
    vocab('fee:account-keeping', 'fee', 1);
    vocab('venue:club', 'venue', 100);
    txn('t1', ['venue:gym', 'fee:account-keeping']);
    txn('t2', ['venue:gym']);
    txn('t3', ['venue:club', 'venue:club']);

    raw.exec(MIGRATION);

    expect(usageOf('venue:gym')).toBe(2);
    expect(usageOf('fee:account-keeping')).toBe(1);
    expect(usageOf('venue:club')).toBe(1);
  });

  it('is a no-op on a second run', () => {
    vocab('venue:gym', 'venue', 50);
    txn('t1', ['venue:gym']);
    raw.exec(MIGRATION);
    const after = usageOf('venue:gym');

    raw.exec(MIGRATION);

    expect(usageOf('venue:gym')).toBe(after);
    expect(usageOf('venue:gym')).toBe(1);
  });

  it('would be caught by this suite if the recount were delta-based rather than a full derivation', () => {
    // A delta-based statement (increment/decrement against prior state) has
    // nothing to anchor "correct" to when the stored value never matched
    // reality in the first place — it can only ever be as right as whatever
    // arithmetic produced the number it starts from. Seeding a wildly wrong
    // count and asserting the exact post-recount value only passes for a
    // statement that derives the count fresh from `transactions`.
    vocab('venue:gym', 'venue', 1_000_000);
    txn('t1', ['venue:gym']);

    raw.exec(MIGRATION);

    expect(usageOf('venue:gym')).toBe(1);
  });
});
