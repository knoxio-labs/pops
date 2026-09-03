/**
 * DB-layer tests for the paired-transfer persistence half (#3607 Stage 3b),
 * against an in-memory SQLite carrying the migrated finance schema.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../__tests__/migrated-db.js';
import { TransactionNotFoundError } from '../../errors.js';
import { transactions } from '../../schema.js';
import { createAccount, updateAccount } from '../accounts.js';
import {
  createTransaction,
  getTransaction,
  type CreateTransactionInput,
  type TransactionRow,
} from '../transactions.js';
import { findPairCandidates, linkTransferPair, unlinkTransferPair } from '../transfer-pairs.js';

import type { FinanceDb } from '../internal.js';

function freshDb(): FinanceDb {
  const db = freshMigratedFinanceDb().db;
  createAccount(db, { name: 'Bendigo', kind: 'checking', currency: 'AUD' });
  createAccount(db, { name: 'ING', kind: 'checking', currency: 'AUD' });
  return db;
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

  it('excludes two legs of the SAME account even though its name changed between the two writes (POPS-2769)', () => {
    // Before the rename, `target.account` is still the old free-text name
    // ('Amex') even though `target.accountId` already points at the renamed
    // row — `createTransaction` stamps `account` from the caller's string at
    // write time, not from a live join. A name-based `ne(account, account)`
    // comparison would see 'Amex' !== 'Amex Legacy Renamed' and wrongly treat
    // these as different accounts; the id-based comparison correctly excludes
    // this pair because both legs share one `accountId`.
    const target = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    updateAccount(db, target.accountId, { name: 'Amex Legacy Renamed' });
    seed(db, {
      account: 'Amex Legacy Renamed',
      amountCents: 5000,
      date: '2026-07-01',
    });
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

describe('unlinkTransferPair', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('symmetrically clears both legs and reverts type by direction (debit->purchase, credit->income)', () => {
    const debit = seed(db, { account: 'Amex', amountCents: -5000 });
    const credit = seed(db, { account: 'Bendigo', amountCents: 5000 });
    expect(linkTransferPair(db, debit.id, credit.id)).toBe(true);

    const updated = unlinkTransferPair(db, debit.id);
    expect(updated.relatedTransactionId).toBeNull();
    expect(updated.type).toBe('purchase');
    const rc = getTransaction(db, credit.id);
    expect(rc.relatedTransactionId).toBeNull();
    expect(rc.type).toBe('income');
  });

  it('unlinks the whole pair when called on the credit leg', () => {
    const debit = seed(db, { account: 'Amex', amountCents: -5000 });
    const credit = seed(db, { account: 'Bendigo', amountCents: 5000 });
    linkTransferPair(db, debit.id, credit.id);

    unlinkTransferPair(db, credit.id);
    expect(getTransaction(db, debit.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, debit.id).type).toBe('purchase');
    expect(getTransaction(db, credit.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, credit.id).type).toBe('income');
  });

  it('is a no-op that preserves the type of a row that is not part of a pair', () => {
    const lone = seed(db, { account: 'Amex', amountCents: -5000, type: 'refund' });
    const result = unlinkTransferPair(db, lone.id);
    expect(result.relatedTransactionId).toBeNull();
    expect(result.type).toBe('refund');
  });

  it('throws TransactionNotFoundError for a missing id', () => {
    expect(() => unlinkTransferPair(db, 'ghost')).toThrow(TransactionNotFoundError);
  });

  it('reverts only the target when the counterpart is not linked back (asymmetric pointer)', () => {
    const a = seed(db, { account: 'Amex', amountCents: -5000, type: 'transfer' });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000, type: 'transfer' });
    const c = seed(db, { account: 'ING', amountCents: 5000, type: 'transfer' });
    // A points at B, but B points at C — a corrupt/asymmetric link.
    db.update(transactions)
      .set({ relatedTransactionId: b.id })
      .where(eq(transactions.id, a.id))
      .run();
    db.update(transactions)
      .set({ relatedTransactionId: c.id })
      .where(eq(transactions.id, b.id))
      .run();

    unlinkTransferPair(db, a.id);

    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, a.id).type).toBe('purchase');
    // B is not paired back to A, so its (mis)pairing with C is left untouched.
    const rb = getTransaction(db, b.id);
    expect(rb.relatedTransactionId).toBe(c.id);
    expect(rb.type).toBe('transfer');
  });
});
