/**
 * Migration test for 0117_strip_fee_tags_from_non_fee_rows (POPS-3699).
 *
 * A `fee:` value names a `fee` row's sub-kind, so every row not typed `fee`
 * loses all of them, compared trimmed and case-insensitively, and nothing else.
 * The `type` column is nullable here so the NULL-type branch is exercised even
 * though the live schema declares it NOT NULL.
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
  usage_count integer NOT NULL DEFAULT 0,
  description text
);
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  description text NOT NULL,
  type text,
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
    '0117_strip_fee_tags_from_non_fee_rows.sql'
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

function txn(id: string, type: string | null, tags: string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, type, tags) VALUES (?, ?, ?, ?)')
    .run(id, `ROW ${id}`, type, JSON.stringify(tags));
}

function vocab(tag: string, usageCount: number): void {
  raw
    .prepare('INSERT INTO tag_vocabulary (tag, facet, usage_count) VALUES (?, ?, ?)')
    .run(tag, tag.split(':')[0], usageCount);
}

function tagsOf(id: string): string[] {
  const row = raw.prepare('SELECT tags FROM transactions WHERE id = ?').get(id) as {
    tags: string;
  };
  return JSON.parse(row.tags) as string[];
}

function usageOf(tag: string): number {
  const row = raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as {
    usage_count: number;
  };
  return row.usage_count;
}

function snapshot(): unknown {
  return {
    transactions: raw.prepare('SELECT * FROM transactions ORDER BY id').all(),
    vocabulary: raw.prepare('SELECT * FROM tag_vocabulary ORDER BY tag').all(),
  };
}

describe('0117_strip_fee_tags_from_non_fee_rows', () => {
  it('strips every fee: value from a transfer, keeping the other tags in order', () => {
    txn('atm', 'transfer', ['channel:atm', 'fee:atm', 'place:tokyo', 'fee:conversion']);

    raw.exec(MIGRATION);

    expect(tagsOf('atm')).toEqual(['channel:atm', 'place:tokyo']);
  });

  it('strips a padded, upper-case fee value from a purchase', () => {
    txn('late', 'purchase', ['venue:cafe', ' FEE:late ']);

    raw.exec(MIGRATION);

    expect(tagsOf('late')).toEqual(['venue:cafe']);
  });

  it('strips fee values from a row with a NULL type', () => {
    txn('untyped', null, ['fee:surcharge', 'channel:online']);

    raw.exec(MIGRATION);

    expect(tagsOf('untyped')).toEqual(['channel:online']);
  });

  it('leaves a fee-typed row untouched', () => {
    txn('fee-row', 'fee', ['fee:atm', ' FEE:conversion ', 'channel:atm']);

    raw.exec(MIGRATION);

    expect(tagsOf('fee-row')).toEqual(['fee:atm', ' FEE:conversion ', 'channel:atm']);
  });

  it('leaves a non-fee row without fee values untouched, including a tag merely containing fee', () => {
    txn('coffee', 'purchase', ['venue:cafe', 'contains:fee:none', 'feel:good']);

    raw.exec(MIGRATION);

    expect(tagsOf('coffee')).toEqual(['venue:cafe', 'contains:fee:none', 'feel:good']);
  });

  it('recounts fee: usage from the rows left and leaves non-fee counts alone', () => {
    vocab('fee:atm', 50);
    vocab('fee:conversion', 50);
    vocab('fee:surcharge', 0);
    vocab('channel:atm', 77);
    txn('atm', 'transfer', ['channel:atm', 'fee:atm', 'fee:conversion']);
    txn('fee-atm', 'fee', ['fee:atm', 'fee:atm']);
    txn('fee-surcharge', 'fee', ['fee:surcharge']);

    raw.exec(MIGRATION);

    expect(usageOf('fee:atm')).toBe(1);
    expect(usageOf('fee:conversion')).toBe(0);
    expect(usageOf('fee:surcharge')).toBe(1);
    expect(usageOf('channel:atm')).toBe(77);
  });

  it('is idempotent: a second run changes nothing', () => {
    vocab('fee:atm', 9);
    vocab('channel:atm', 3);
    txn('atm', 'transfer', ['channel:atm', 'fee:atm', 'fee:conversion']);
    txn('untyped', null, [' FEE:late ']);
    txn('fee-row', 'fee', ['fee:atm']);
    txn('coffee', 'purchase', ['venue:cafe']);

    raw.exec(MIGRATION);
    const afterFirst = snapshot();
    raw.exec(MIGRATION);

    expect(snapshot()).toEqual(afterFirst);
  });
});
