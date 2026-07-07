/**
 * Tests for the nightly paired-transfer reconcile worker (#3607 Stage 3d)
 * against an in-memory SQLite seeded with the canonical `transactions` DDL.
 * Covers the feature gate, linking, ambiguity, cross-pass idempotency, and the
 * recursive-timer / stop() lifecycle.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTransaction,
  getTransaction,
  type CreateTransactionInput,
  type TransactionRow,
} from '../../../db/services/transactions.js';
import { startReconcilePairedTransfersWorker } from '../reconcile-paired-transfers.js';

import type { FinanceDb } from '../../../db/services/internal.js';

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
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account);
`;

const ENABLED = 'FINANCE_TRANSFER_PAIR_ENABLED';
const WINDOW = 'FINANCE_TRANSFER_PAIR_WINDOW_DAYS';
const LONG_INTERVAL = 1_000_000;

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

describe('reconcile-paired-transfers worker', () => {
  const savedEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    savedEnv[ENABLED] = process.env[ENABLED];
    savedEnv[WINDOW] = process.env[WINDOW];
    delete process.env[WINDOW];
  });
  afterEach(() => {
    for (const key of [ENABLED, WINDOW]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('is a no-op when the feature gate is off', () => {
    delete process.env[ENABLED];
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000 });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000 });
    const handle = startReconcilePairedTransfersWorker({ db, intervalMs: LONG_INTERVAL });
    const stats = handle.runOnce();
    handle.stop();
    expect(stats).toEqual({ examined: 0, linked: 0, ambiguous: 0, skipped: 0 });
    expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, b.id).relatedTransactionId).toBeNull();
  });

  it('links a pair whose legs were imported separately', () => {
    process.env[ENABLED] = 'true';
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-02' });
    const handle = startReconcilePairedTransfersWorker({ db, intervalMs: LONG_INTERVAL });
    const stats = handle.runOnce();
    handle.stop();
    expect(stats.linked).toBe(1);
    expect(stats.examined).toBe(2);
    expect(getTransaction(db, a.id).relatedTransactionId).toBe(b.id);
    expect(getTransaction(db, b.id).type).toBe('transfer');
  });

  it('leaves competing debits unlinked and counts them ambiguous', () => {
    process.env[ENABLED] = 'true';
    const db = freshDb();
    const debitA = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const debitB = seed(db, { account: 'Bendigo', amountCents: -5000, date: '2026-07-01' });
    const credit = seed(db, { account: 'ING', amountCents: 5000, date: '2026-07-01' });
    const handle = startReconcilePairedTransfersWorker({ db, intervalMs: LONG_INTERVAL });
    const stats = handle.runOnce();
    handle.stop();
    expect(stats.linked).toBe(0);
    expect(stats.ambiguous).toBe(3);
    for (const row of [debitA, debitB, credit]) {
      expect(getTransaction(db, row.id).relatedTransactionId).toBeNull();
    }
  });

  it('is idempotent across passes — a second run links nothing new', () => {
    process.env[ENABLED] = 'true';
    const db = freshDb();
    const a = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
    const b = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-01' });
    const lonely = seed(db, { account: 'ING', amountCents: -9900, date: '2026-07-01' });
    const handle = startReconcilePairedTransfersWorker({ db, intervalMs: LONG_INTERVAL });
    expect(handle.runOnce().linked).toBe(1);
    const second = handle.runOnce();
    handle.stop();
    expect(second.linked).toBe(0);
    // a and b are linked so they drop out of the candidate set; only lonely remains.
    expect(second.examined).toBe(1);
    expect(getTransaction(db, lonely.id).relatedTransactionId).toBeNull();
    expect(getTransaction(db, a.id).relatedTransactionId).toBe(b.id);
  });

  it('fires on the interval and stop() halts further ticks', () => {
    process.env[ENABLED] = 'true';
    vi.useFakeTimers();
    try {
      const db = freshDb();
      const a = seed(db, { account: 'Amex', amountCents: -5000, date: '2026-07-01' });
      const b = seed(db, { account: 'Bendigo', amountCents: 5000, date: '2026-07-01' });
      const handle = startReconcilePairedTransfersWorker({ db, intervalMs: 1000 });

      // No immediate pass at construction — the pair is still unlinked.
      expect(getTransaction(db, a.id).relatedTransactionId).toBeNull();

      // First scheduled tick links the pair.
      vi.advanceTimersByTime(1000);
      expect(getTransaction(db, a.id).relatedTransactionId).toBe(b.id);

      handle.stop();

      // A new unlinked pair must NOT be touched after stop().
      const c = seed(db, { account: 'UP', amountCents: -7000, date: '2026-07-01' });
      const d = seed(db, { account: 'Up2', amountCents: 7000, date: '2026-07-01' });
      vi.advanceTimersByTime(10_000);
      expect(getTransaction(db, c.id).relatedTransactionId).toBeNull();
      expect(getTransaction(db, d.id).relatedTransactionId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
