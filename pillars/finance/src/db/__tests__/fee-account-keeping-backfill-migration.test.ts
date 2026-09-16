/**
 * Migration test for 0115_fee_account_keeping_backfill (POPS-3703).
 *
 * The review finding this migration grew to cover: `MONTHLY ACCOUNT FEE` and
 * `ACCOUNT SERVICE FEE` are bank account fees, not memberships, so a row
 * imported under the old `fee:membership` pattern must move to
 * `fee:account-keeping` — and `usage_count` on both values must end up
 * matching what the rows actually carry afterwards, not a hand-adjusted
 * delta. A genuine membership descriptor (a gym) must be left exactly as
 * authored; conflating the two would be the whole point missed.
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
  type text NOT NULL,
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
    '0115_fee_account_keeping_backfill.sql'
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

function vocab(tag: string, usageCount: number): void {
  raw
    .prepare('INSERT INTO tag_vocabulary (tag, facet, usage_count) VALUES (?, ?, ?)')
    .run(tag, 'fee', usageCount);
}

function txn(id: string, description: string, type: string, tags: string[]): void {
  raw
    .prepare('INSERT INTO transactions (id, description, type, tags) VALUES (?, ?, ?, ?)')
    .run(id, description, type, JSON.stringify(tags));
}

function rowOf(id: string): { type: string; tags: string[] } {
  const row = raw.prepare('SELECT type, tags FROM transactions WHERE id = ?').get(id) as {
    type: string;
    tags: string;
  };
  return { type: row.type, tags: JSON.parse(row.tags) as string[] };
}

function usageOf(tag: string): number {
  const row = raw.prepare('SELECT usage_count FROM tag_vocabulary WHERE tag = ?').get(tag) as {
    usage_count: number;
  };
  return row.usage_count;
}

describe('0115_fee_account_keeping_backfill — bank fees mistagged as membership', () => {
  it('moves an ACCOUNT SERVICE FEE row off fee:membership onto fee:account-keeping', () => {
    vocab('fee:membership', 1);
    vocab('fee:account-keeping', 0);
    txn('bank-fee', 'ACCOUNT SERVICE FEE', 'fee', ['fee:membership']);

    raw.exec(MIGRATION);

    expect(rowOf('bank-fee')).toEqual({ type: 'fee', tags: ['fee:account-keeping'] });
    expect(usageOf('fee:membership')).toBe(0);
    expect(usageOf('fee:account-keeping')).toBe(1);
  });

  it('moves a MONTHLY ACCOUNT FEE row the same way and keeps any other tag on it', () => {
    vocab('fee:membership', 1);
    vocab('fee:account-keeping', 0);
    txn('bank-fee-2', 'MONTHLY ACCOUNT FEE', 'fee', ['contains:fee', 'fee:membership']);

    raw.exec(MIGRATION);

    expect(rowOf('bank-fee-2')).toEqual({
      type: 'fee',
      tags: ['contains:fee', 'fee:account-keeping'],
    });
  });

  it('leaves a genuine gym membership row untouched', () => {
    vocab('fee:membership', 1);
    vocab('fee:account-keeping', 0);
    txn('gym', 'ANYTOWN GYM MEMBERSHIP FEE', 'fee', ['fee:membership']);

    raw.exec(MIGRATION);

    expect(rowOf('gym')).toEqual({ type: 'fee', tags: ['fee:membership'] });
    expect(usageOf('fee:membership')).toBe(1);
    expect(usageOf('fee:account-keeping')).toBe(0);
  });

  it('drops fee:membership usage and raises fee:account-keeping usage when both kinds are present', () => {
    vocab('fee:membership', 2);
    vocab('fee:account-keeping', 0);
    txn('bank-fee', 'ACCOUNT SERVICE FEE', 'fee', ['fee:membership']);
    txn('gym', 'ANYTOWN GYM MEMBERSHIP FEE', 'fee', ['fee:membership']);

    raw.exec(MIGRATION);

    expect(usageOf('fee:membership')).toBe(1);
    expect(usageOf('fee:account-keeping')).toBe(1);
  });

  it('retypes a purchase row imported before the pattern existed', () => {
    vocab('fee:membership', 0);
    vocab('fee:account-keeping', 0);
    txn('pre-fix-import', 'MONTHLY ACCOUNT FEE', 'purchase', []);

    raw.exec(MIGRATION);

    expect(rowOf('pre-fix-import')).toEqual({ type: 'fee', tags: ['fee:account-keeping'] });
  });

  it('is idempotent: a second run changes nothing further', () => {
    vocab('fee:membership', 1);
    vocab('fee:account-keeping', 0);
    txn('bank-fee', 'ACCOUNT SERVICE FEE', 'fee', ['fee:membership']);

    raw.exec(MIGRATION);
    const after = rowOf('bank-fee');
    const membershipAfter = usageOf('fee:membership');
    const accountKeepingAfter = usageOf('fee:account-keeping');

    raw.exec(MIGRATION);

    expect(rowOf('bank-fee')).toEqual(after);
    expect(usageOf('fee:membership')).toBe(membershipAfter);
    expect(usageOf('fee:account-keeping')).toBe(accountKeepingAfter);
  });
});
