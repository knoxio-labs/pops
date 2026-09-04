/**
 * Invariant tests for `mergeAccounts`/`previewAccountMerge` (POPS-2812)
 * against an in-memory SQLite carrying the migrated finance schema.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AccountMergeCurrencyMismatchError,
  AccountMergeGiftCardDetailsConflictError,
  AccountMergePendingResolutionError,
  AccountMergeSameAccountError,
  AccountMergeSignMismatchError,
  AccountNotFoundError,
} from '../errors.js';
import {
  accountGiftCardDetails,
  accounts,
  entityPrecreateOutbox,
  transactions,
} from '../schema.js';
import { createAccount, getAccount } from '../services/accounts.js';
import { writeGiftCardDetails } from '../services/gift-card-details.js';
import { mergeAccounts, previewAccountMerge } from '../services/merge-accounts.js';
import { createTransaction } from '../services/transactions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

const AMEX_ID = '00000000-0000-4000-8000-000000000003';
const ANZ_ID = '00000000-0000-4000-8000-000000000004';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

function addTransaction(db: FinanceDb, accountId: string, amountCents: number): void {
  createTransaction(db, {
    description: 'test txn',
    accountId,
    amountCents,
    date: '2026-01-01',
  });
}

describe('previewAccountMerge', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('reports the source transaction count and the summed resulting balance', () => {
    addTransaction(db, AMEX_ID, -1000);
    addTransaction(db, AMEX_ID, -500);
    addTransaction(db, ANZ_ID, 200);

    const preview = previewAccountMerge(db, AMEX_ID, ANZ_ID);

    expect(preview.source.id).toBe(AMEX_ID);
    expect(preview.target.id).toBe(ANZ_ID);
    expect(preview.transactionCount).toBe(2);
    expect(preview.resultingBalanceCents).toBe(-1300);
    expect(preview.hasGiftCardDetailsConflict).toBe(false);
  });

  it('reports zero transactions and a zero resulting balance for two empty accounts', () => {
    const preview = previewAccountMerge(db, AMEX_ID, ANZ_ID);
    expect(preview.transactionCount).toBe(0);
    expect(preview.resultingBalanceCents).toBe(0);
  });

  it('throws AccountNotFoundError for an unknown source or target id', () => {
    expect(() => previewAccountMerge(db, 'missing', ANZ_ID)).toThrow(AccountNotFoundError);
    expect(() => previewAccountMerge(db, AMEX_ID, 'missing')).toThrow(AccountNotFoundError);
  });

  it('throws AccountMergeSameAccountError merging an account into itself', () => {
    expect(() => previewAccountMerge(db, AMEX_ID, AMEX_ID)).toThrow(AccountMergeSameAccountError);
  });

  it('throws AccountMergeCurrencyMismatchError across currencies', () => {
    const usd = createAccount(db, { name: 'US Checking', kind: 'checking', currency: 'USD' });
    expect(() => previewAccountMerge(db, AMEX_ID, usd.id)).toThrow(
      AccountMergeCurrencyMismatchError
    );
  });

  it('throws AccountMergeSignMismatchError merging an asset account into a liability account', () => {
    const cash = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    // AMEX_ID is a credit-card (liability); cash is an asset.
    expect(() => previewAccountMerge(db, cash.id, AMEX_ID)).toThrow(AccountMergeSignMismatchError);
  });

  it('does not throw for two different asset kinds sharing a sign convention', () => {
    const cash = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    const checking = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' });
    expect(() => previewAccountMerge(db, cash.id, checking.id)).not.toThrow();
  });

  it('reports a gift-card details conflict without throwing', () => {
    const cardA = createAccount(db, { name: 'Card A', kind: 'gift-card', currency: 'AUD' });
    const cardB = createAccount(db, { name: 'Card B', kind: 'gift-card', currency: 'AUD' });
    writeGiftCardDetails(db, cardA.id, 'test-key', { number: '1111222233334444', pin: '1234' });
    writeGiftCardDetails(db, cardB.id, 'test-key', { number: '5555666677778888', pin: '4321' });

    const preview = previewAccountMerge(db, cardA.id, cardB.id);
    expect(preview.hasGiftCardDetailsConflict).toBe(true);
  });
});

describe('mergeAccounts', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('deletes the source account outright', () => {
    addTransaction(db, AMEX_ID, -1000);
    addTransaction(db, ANZ_ID, 200);

    const result = mergeAccounts(db, AMEX_ID, ANZ_ID);

    expect(result.id).toBe(ANZ_ID);
    const remaining = db.select().from(accounts).where(eq(accounts.id, AMEX_ID)).all();
    expect(remaining).toHaveLength(0);
  });

  it('leaves no transaction referencing the retired account (acceptance criterion)', () => {
    addTransaction(db, AMEX_ID, -1000);
    addTransaction(db, AMEX_ID, -500);

    mergeAccounts(db, AMEX_ID, ANZ_ID);

    const allTransactions = db.select().from(transactions).all();
    expect(allTransactions.every((row) => row.accountId !== AMEX_ID)).toBe(true);
    expect(allTransactions.filter((row) => row.accountId === ANZ_ID)).toHaveLength(2);
  });

  it('throws AccountMergeSameAccountError and writes nothing for a self-merge', () => {
    addTransaction(db, AMEX_ID, -1000);
    expect(() => mergeAccounts(db, AMEX_ID, AMEX_ID)).toThrow(AccountMergeSameAccountError);
    expect(getAccount(db, AMEX_ID)).toBeDefined();
  });

  it('throws AccountMergeCurrencyMismatchError and writes nothing across currencies', () => {
    const usd = createAccount(db, { name: 'US Checking', kind: 'checking', currency: 'USD' });
    addTransaction(db, AMEX_ID, -1000);

    expect(() => mergeAccounts(db, AMEX_ID, usd.id)).toThrow(AccountMergeCurrencyMismatchError);
    expect(getAccount(db, AMEX_ID)).toBeDefined();
  });

  it('throws AccountMergeSignMismatchError and writes nothing across sign conventions', () => {
    const cash = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });
    expect(() => mergeAccounts(db, cash.id, AMEX_ID)).toThrow(AccountMergeSignMismatchError);
    expect(getAccount(db, cash.id)).toBeDefined();
  });

  it('moves a lone gift-card details row onto the target when only the source has one', () => {
    const cardA = createAccount(db, { name: 'Card A', kind: 'gift-card', currency: 'AUD' });
    const cardB = createAccount(db, { name: 'Card B', kind: 'gift-card', currency: 'AUD' });
    writeGiftCardDetails(db, cardA.id, 'test-key', { number: '1111222233334444', pin: '1234' });

    mergeAccounts(db, cardA.id, cardB.id);

    const moved = db
      .select()
      .from(accountGiftCardDetails)
      .where(eq(accountGiftCardDetails.accountId, cardB.id))
      .get();
    expect(moved?.lastFour).toBe('4444');
  });

  it('throws AccountMergeGiftCardDetailsConflictError and writes nothing when both sides carry gift-card details', () => {
    const cardA = createAccount(db, { name: 'Card A', kind: 'gift-card', currency: 'AUD' });
    const cardB = createAccount(db, { name: 'Card B', kind: 'gift-card', currency: 'AUD' });
    writeGiftCardDetails(db, cardA.id, 'test-key', { number: '1111222233334444', pin: '1234' });
    writeGiftCardDetails(db, cardB.id, 'test-key', { number: '5555666677778888', pin: '4321' });
    addTransaction(db, cardA.id, -100);

    expect(() => mergeAccounts(db, cardA.id, cardB.id)).toThrow(
      AccountMergeGiftCardDetailsConflictError
    );
    expect(getAccount(db, cardA.id)).toBeDefined();
    const cardADetails = db
      .select()
      .from(accountGiftCardDetails)
      .where(eq(accountGiftCardDetails.accountId, cardA.id))
      .get();
    expect(cardADetails).toBeDefined();
  });

  it('throws AccountMergePendingResolutionError for a source with an unresolved contact outbox row', () => {
    const person = createAccount(
      db,
      { name: 'Pending Person', kind: 'person', currency: 'AUD' },
      { allowPendingEntity: true }
    );
    expect(person.entityId).toBeNull();
    // 'person' is an asset-sign kind (see ACCOUNT_KIND_BEHAVIOURS) — target
    // must share that convention, or the sign-mismatch refusal would fire
    // first and this test would never reach the pending-resolution check.
    const cash = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });

    const pendingRow = db
      .select()
      .from(entityPrecreateOutbox)
      .where(eq(entityPrecreateOutbox.accountId, person.id))
      .get();
    expect(pendingRow).toBeDefined();

    expect(() => mergeAccounts(db, person.id, cash.id)).toThrow(AccountMergePendingResolutionError);
  });
});
