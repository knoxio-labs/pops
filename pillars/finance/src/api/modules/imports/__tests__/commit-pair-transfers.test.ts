/**
 * Tests for the commit-time paired-transfer phase (#3607 Stage 3c), against an
 * in-memory SQLite carrying the migrated finance schema. Exercises the feature
 * gate, the happy path (batch↔batch and batch↔existing), rule precedence, and
 * the mutual-uniqueness guard against competing candidates.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactions } from '../../../../db/schema.js';
import { createAccount } from '../../../../db/services/accounts.js';
import {
  createTransaction,
  getTransaction,
  type CreateTransactionInput,
  type TransactionRow,
} from '../../../../db/services/transactions.js';
import { pairTransfersPhase } from '../commit-pair-transfers.js';

import type { FinanceDb } from '../../../../db/services/internal.js';

const ENABLED = 'FINANCE_TRANSFER_PAIR_ENABLED';
const WINDOW = 'FINANCE_TRANSFER_PAIR_WINDOW_DAYS';

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

describe('pairTransfersPhase (gate off)', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[ENABLED];
    delete process.env[ENABLED];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[ENABLED];
    else process.env[ENABLED] = saved;
  });

  it('is a no-op that links nothing when the feature gate is unset', () => {
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    expect(pairTransfersPhase(db, [a.id, b.id])).toBe(0);
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, b.id).relatedTransactionId).toBeNull();
  });
});

describe('pairTransfersPhase (enabled)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    savedEnv[ENABLED] = process.env[ENABLED];
    savedEnv[WINDOW] = process.env[WINDOW];
    process.env[ENABLED] = 'true';
    delete process.env[WINDOW];
  });
  afterEach(() => {
    for (const key of [ENABLED, WINDOW]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('links two batch rows to each other and types both as transfer', () => {
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-02' });
    expect(pairTransfersPhase(db, [a.id, b.id])).toBe(1);
    const ra = getTransaction(db, a.id);
    const rb = getTransaction(db, b.id);
    expect(ra.relatedTransactionId).toBe(b.id);
    expect(rb.relatedTransactionId).toBe(a.id);
    expect(ra.type).toBe('transfer');
    expect(rb.type).toBe('transfer');
  });

  it('links a batch row to an existing committed row not in the batch', () => {
    const db = freshDb();
    const existing = seed(db, { account: 'ING', amountCents: 5000, date: '2026-07-01' });
    const batch = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    expect(pairTransfersPhase(db, [batch.id])).toBe(1);
    expect(getTransaction(db, batch.id).relatedTransactionId).toBe(existing.id);
    expect(getTransaction(db, existing.id).relatedTransactionId).toBe(batch.id);
    expect(getTransaction(db, existing.id).type).toBe('transfer');
  });

  it('skips a correction-rule-classified batch row (rules take precedence)', () => {
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    db.update(transactions)
      .set({ matchType: 'learned', matchRuleId: 'r1', matchConfidence: 0.9 })
      .where(eq(transactions.id, a.id))
      .run();
    expect(pairTransfersPhase(db, [a.id, b.id])).toBe(0);
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, a.id).matchRuleId).toBe('r1');
    expect(getTransaction(db, b.id).relatedTransactionId).toBeNull();
  });

  it('does not link when two debits compete for one credit (mutual-uniqueness fails)', () => {
    const db = freshDb();
    const debitA = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const debitB = seed(db, { account: 'Bendigo', amountCents: -5000, date: '2026-07-01' });
    const credit = seed(db, { account: 'ING', amountCents: 5000, date: '2026-07-01' });
    expect(pairTransfersPhase(db, [debitA.id, debitB.id, credit.id])).toBe(0);
    expect(getTransaction(db, debitA.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, debitB.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, credit.id).relatedTransactionId).toBeNull();
  });

  it('links nothing when a batch row has no counterpart', () => {
    const db = freshDb();
    const lonely = seed(db, { account: 'Amex', amountCents: -5000 });
    expect(pairTransfersPhase(db, [lonely.id])).toBe(0);
    expect(getTransaction(db, lonely.id).relatedTransactionId).toBeNull();
  });

  it('respects the pairing window (a counterpart beyond the default 3 days is not linked)', () => {
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-05' });
    expect(pairTransfersPhase(db, [a.id, b.id])).toBe(0);
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
  });

  it('isolates a per-row pairing failure without aborting the rest of the batch', () => {
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-01' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const linked = pairTransfersPhase(db, ['does-not-exist', a.id, b.id]);
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
    expect(linked).toBe(1);
    expect(getTransaction(db, a.id).relatedTransactionId).toBe(b.id);
  });
});
