/**
 * DB-layer tests for the paired-transfer persistence half (#3607 Stage 3b),
 * against an in-memory SQLite seeded with the canonical `transactions` DDL.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { TransactionNotFoundError } from '../../errors.js';
import { transactions } from '../../schema.js';
import {
  createTransaction,
  getTransaction,
  type CreateTransactionInput,
  type TransactionRow,
} from '../transactions.js';
import { findPairCandidates, linkTransferPair } from '../transfer-pairs.js';

import type { FinanceDb } from '../internal.js';

const TRANSACTIONS_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount_cents integer NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL,
  match_type text,
  match_rule_id text,
  match_confidence real
);
CREATE UNIQUE INDEX transactions_notion_id_unique ON transactions (notion_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account);
CREATE INDEX idx_transactions_entity ON transactions (entity_id);
CREATE INDEX idx_transactions_last_edited ON transactions (last_edited_time);
CREATE INDEX idx_transactions_notion_id ON transactions (notion_id);
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);
`;

function freshDb(): FinanceDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(TRANSACTIONS_DDL);
  return drizzle(raw);
}

function seed(db: FinanceDb, overrides: Partial<CreateTransactionInput> = {}): TransactionRow {
  return createTransaction(db, {
    description: 'seed',
    account: 'Amex',
    amountCents: -5000,
    date: '2026-07-01',
    ...overrides,
  });
}

describe('findPairCandidates', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the exact-opposite, different-account, unlinked, in-window row', () => {
    const target = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const match = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-02' });
    expect(findPairCandidates(db, target, 3).map((row) => row.id)).toEqual([match.id]);
  });

  it('excludes a same-account row', () => {
    const target = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    seed(db, { account: 'Amex', amountCents: 5000, date: '2026-07-01' });
    expect(findPairCandidates(db, target, 3)).toEqual([]);
  });

  it('excludes a same-sign row (not the exact-opposite cents)', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    seed(db, { account: 'Bendigo', amountCents: -5000, date: '2026-07-01' });
    expect(findPairCandidates(db, target, 3)).toEqual([]);
  });

  it('excludes a different-amount row', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    seed(db, { account: 'Bendigo', amountCents: 5001, date: '2026-07-01' });
    expect(findPairCandidates(db, target, 3)).toEqual([]);
  });

  it('excludes an already-linked row', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    const linked = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-01' });
    db.update(transactions)
      .set({ relatedTransactionId: 'elsewhere' })
      .where(eq(transactions.id, linked.id))
      .run();
    expect(findPairCandidates(db, target, 3)).toEqual([]);
  });

  it('excludes a correction-rule-classified row (rules take precedence over pairing)', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    const ruled = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-01' });
    db.update(transactions)
      .set({ matchType: 'learned', matchRuleId: 'r1', matchConfidence: 0.9 })
      .where(eq(transactions.id, ruled.id))
      .run();
    expect(findPairCandidates(db, target, 3)).toEqual([]);
  });

  it('keeps an entity-matcher / AI classified row eligible (only rules outrank pairing)', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    const aiMatched = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-01' });
    db.update(transactions)
      .set({ matchType: 'ai', matchConfidence: 0.8 })
      .where(eq(transactions.id, aiMatched.id))
      .run();
    expect(findPairCandidates(db, target, 3).map((row) => row.id)).toEqual([aiMatched.id]);
  });

  it('excludes a row one day beyond the window', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-05' });
    expect(findPairCandidates(db, target, 3)).toEqual([]);
  });

  it('includes rows exactly on both window boundaries', () => {
    const target = seed(db, { amountCents: -5000, date: '2026-07-01' });
    const before = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-06-28' });
    const after = seed(db, { account: 'ING', amountCents: 5000, date: '2026-07-04' });
    expect(
      findPairCandidates(db, target, 3)
        .map((row) => row.id)
        .toSorted()
    ).toEqual([before.id, after.id].toSorted());
  });
});

describe('linkTransferPair', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('symmetrically links two rows and types both as transfer', () => {
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    expect(linkTransferPair(db, a.id, b.id)).toBe(true);
    const ra = getTransaction(db, a.id);
    const rb = getTransaction(db, b.id);
    expect(ra.relatedTransactionId).toBe(b.id);
    expect(rb.relatedTransactionId).toBe(a.id);
    expect(ra.type).toBe('transfer');
    expect(rb.type).toBe('transfer');
  });

  it('records the pairing as automatic (matchType none), never a manual override', () => {
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    linkTransferPair(db, a.id, b.id);
    expect(getTransaction(db, a.id).matchType).toBe('none');
    expect(getTransaction(db, b.id).matchType).toBe('none');
  });

  it('clears a previously-assigned entity + AI/entity-matcher provenance on an unambiguous link', () => {
    const a = seed(db, {
      account: 'Amex',
      amountCents: -5000,
      entityId: 'e1',
      entityName: 'Landlord',
    });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    db.update(transactions)
      .set({ matchType: 'ai', matchConfidence: 0.8 })
      .where(eq(transactions.id, a.id))
      .run();
    expect(linkTransferPair(db, a.id, b.id)).toBe(true);
    const ra = getTransaction(db, a.id);
    expect(ra.entityId).toBeNull();
    expect(ra.entityName).toBeNull();
    expect(ra.matchConfidence).toBeNull();
    expect(ra.matchType).toBe('none');
  });

  it('refuses to link when either side is correction-rule-classified, preserving provenance', () => {
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    db.update(transactions)
      .set({ matchType: 'learned', matchRuleId: 'r1', matchConfidence: 0.9 })
      .where(eq(transactions.id, b.id))
      .run();
    expect(linkTransferPair(db, a.id, b.id)).toBe(false);
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, a.id).type).not.toBe('transfer');
    const rb = getTransaction(db, b.id);
    expect(rb.matchRuleId).toBe('r1');
    expect(rb.relatedTransactionId).toBeNull();
  });

  it('is idempotent — refuses to relink when either side already carries a related id', () => {
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    const c = seed(db, { account: 'ING', amountCents: 5000 });
    expect(linkTransferPair(db, a.id, b.id)).toBe(true);
    expect(linkTransferPair(db, a.id, c.id)).toBe(false);
    expect(getTransaction(db, a.id).relatedTransactionId).toBe(b.id);
    expect(getTransaction(db, c.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, c.id).type).not.toBe('transfer');
  });

  it('returns false without writing when linking a row to itself', () => {
    const a = seed(db, { amountCents: -5000 });
    expect(linkTransferPair(db, a.id, a.id)).toBe(false);
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, a.id).type).not.toBe('transfer');
  });

  it('throws TransactionNotFoundError and writes nothing when a side is missing', () => {
    const a = seed(db, { amountCents: -5000 });
    expect(() => linkTransferPair(db, a.id, 'ghost')).toThrow(TransactionNotFoundError);
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, a.id).type).not.toBe('transfer');
  });
});
