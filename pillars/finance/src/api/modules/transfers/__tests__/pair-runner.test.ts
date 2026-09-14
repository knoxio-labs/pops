/**
 * Tests for `predictPairOutcome` (#3607 Stage 3) — the read-only mutuality
 * check shared by `attemptPairForRow` (which links) and the backfill
 * script's dry run (which only reports). The case this file exists to pin
 * down: a naive caller that reran only the one-directional
 * `findPairForTransaction` — instead of this function — would over-report a
 * match on exactly the "two identical debits competing for one credit" case
 * below, since each debit sees the credit as its unique best match even
 * though the credit itself is ambiguous between them.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { transactions } from '../../../../db/schema.js';
import { resolveAccountIdByName } from '../../../../db/services/account-lookup.js';
import { createAccount } from '../../../../db/services/accounts.js';
import {
  createTransaction,
  type CreateTransactionInput,
  type TransactionRow,
} from '../../../../db/services/transactions.js';
import { predictPairOutcome } from '../pair-runner.js';

import type { FinanceDb } from '../../../../db/services/internal.js';

function freshDb(): FinanceDb {
  const db = freshMigratedFinanceDb().db;
  // 'Amex' and 'ANZ Credit Card' are already seeded by 0083_accounts.sql.
  createAccount(db, { name: 'Bendigo', kind: 'checking', currency: 'AUD' });
  createAccount(db, { name: 'ING', kind: 'checking', currency: 'AUD' });
  return db;
}

function seed(
  db: FinanceDb,
  accountName: string,
  overrides: Partial<CreateTransactionInput> = {}
): TransactionRow {
  const amountCents = overrides.amountCents ?? -5000;
  return createTransaction(db, {
    description: 'seed',
    accountId: resolveAccountIdByName(db, accountName),
    date: '2026-07-01',
    type: 'transfer',
    ...overrides,
    amountCents,
  });
}

describe('predictPairOutcome', () => {
  it('predicts a match for a unique mutual counterpart', () => {
    const db = freshDb();
    const debit = seed(db, 'Amex', { amountCents: -5000 });
    const credit = seed(db, 'Bendigo', { amountCents: 5000 });
    const prediction = predictPairOutcome(db, debit, 3);
    expect(prediction.kind).toBe('match');
    if (prediction.kind === 'match') expect(prediction.counterpart.id).toBe(credit.id);
  });

  it('predicts ambiguous — not match — when two debits compete for one credit', () => {
    // The exact false-positive shape a one-directional matcher would miss: from
    // EACH debit's own view the credit is its unique closest candidate, but the
    // credit itself has two equally-close debits.
    const db = freshDb();
    const debitA = seed(db, 'Amex', { amountCents: -5000, date: '2026-07-01' });
    const debitB = seed(db, 'Bendigo', { amountCents: -5000, date: '2026-07-01' });
    const credit = seed(db, 'ING', { amountCents: 5000, date: '2026-07-01' });

    expect(predictPairOutcome(db, debitA, 3).kind).toBe('ambiguous');
    expect(predictPairOutcome(db, debitB, 3).kind).toBe('ambiguous');
    expect(predictPairOutcome(db, credit, 3).kind).toBe('ambiguous');
  });

  it('pairs the leg that shares the bank reference, from both sides, and not the coincidental deposit', () => {
    // The 2026-06-30 production case, through the row projection rather than a
    // hand-built candidate: the reference has to survive `toPairCandidate`.
    const db = freshDb();
    const everyday = seed(db, 'Bendigo', {
      amountCents: -300000,
      date: '2026-06-30',
      description: 'ANZ M-BANKING FUNDS TFER TRANSFER 964110  TO 4564XXXXXXXX7373',
    });
    const card = seed(db, 'ANZ Credit Card', {
      amountCents: 300000,
      date: '2026-06-30',
      description: 'PAYMENT THANKYOU 964110',
    });
    const payId = seed(db, 'Amex', {
      amountCents: 300000,
      date: '2026-06-30',
      description: 'PayID Payment Received, Thank you',
    });

    const fromEveryday = predictPairOutcome(db, everyday, 3);
    expect(fromEveryday.kind).toBe('match');
    if (fromEveryday.kind === 'match') expect(fromEveryday.counterpart.id).toBe(card.id);

    const fromCard = predictPairOutcome(db, card, 3);
    expect(fromCard.kind).toBe('match');
    if (fromCard.kind === 'match') expect(fromCard.counterpart.id).toBe(everyday.id);

    // The deposit's only candidate is the Everyday debit, but that debit's
    // unique best is the card — so the pairing is not mutual and must not link.
    expect(predictPairOutcome(db, payId, 3).kind).not.toBe('match');
  });

  it('does not pair a card purchase with a same-day reimbursement, whatever the reimbursement is typed (POPS-3940)', () => {
    const db = freshDb();
    createAccount(db, { name: 'Up', kind: 'checking', currency: 'AUD' });
    const amazon = seed(db, 'Amex', {
      amountCents: -12239,
      date: '2026-04-27',
      description: 'AMAZON RETA* AMAZON AU',
      type: 'purchase',
    });
    const andrew = seed(db, 'Up', {
      amountCents: 12239,
      date: '2026-04-27',
      description: 'Andrew Borg',
      type: 'income',
    });
    expect(predictPairOutcome(db, amazon, 3).kind).toBe('no-match');
    expect(predictPairOutcome(db, andrew, 3).kind).toBe('no-match');

    const andrewAsTransfer = seed(db, 'Up', {
      amountCents: 12239,
      date: '2026-05-06',
      description: 'Andrew Borg',
    });
    const secondAmazon = seed(db, 'Amex', {
      amountCents: -12239,
      date: '2026-05-06',
      description: 'AMAZON MARKETPLACE AU',
      type: 'purchase',
    });
    expect(predictPairOutcome(db, secondAmazon, 3).kind).toBe('no-match');
    expect(predictPairOutcome(db, andrewAsTransfer, 3).kind).toBe('no-match');
  });

  it('predicts a match for a rule-classified transfer leg (POPS-3939)', () => {
    const db = freshDb();
    const debit = seed(db, 'Bendigo', { amountCents: -5000 });
    const credit = seed(db, 'Amex', { amountCents: 5000 });
    db.update(transactions)
      .set({ matchType: 'learned', matchRuleId: 'r1', matchConfidence: 0.9 })
      .where(eq(transactions.id, debit.id))
      .run();
    const ruled = { ...debit, matchType: 'learned' as const, matchRuleId: 'r1' };

    const prediction = predictPairOutcome(db, ruled, 3);
    expect(prediction.kind).toBe('match');
    if (prediction.kind === 'match') expect(prediction.counterpart.id).toBe(credit.id);
  });

  it('predicts no-match with an empty candidate pool', () => {
    const db = freshDb();
    const lonely = seed(db, 'Amex', { amountCents: -5000 });
    expect(predictPairOutcome(db, lonely, 3).kind).toBe('no-match');
  });

  it('predicts skipped for an already-linked row', () => {
    const db = freshDb();
    const debit = seed(db, 'Amex', { amountCents: -5000, date: '2026-07-01' });
    const linked: TransactionRow = { ...debit, relatedTransactionId: 'already-linked-elsewhere' };
    expect(predictPairOutcome(db, linked, 3).kind).toBe('skipped');
  });
});
