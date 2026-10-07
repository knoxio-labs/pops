/**
 * Tests for `pairSavedTransfer` (POPS-5868): the one promise the REST suite
 * cannot reach, that a pairing failure leaves the saved row standing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { resolveAccountIdByName } from '../../../../db/services/account-lookup.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { createTransaction } from '../../../../db/services/transactions.js';
import { pairSavedTransfer } from '../pair-on-save.js';

const ENABLED = 'FINANCE_TRANSFER_PAIR_ENABLED';

let previous: string | undefined;

beforeEach(() => {
  previous = process.env[ENABLED];
  process.env[ENABLED] = 'true';
});

afterEach(() => {
  if (previous === undefined) delete process.env[ENABLED];
  else process.env[ENABLED] = previous;
  vi.restoreAllMocks();
});

function seededPair() {
  const opened = freshMigratedFinanceDb();
  createAccount(opened.db, { name: 'Bendigo', kind: 'checking', currency: 'AUD' });
  createAccount(opened.db, { name: 'ING', kind: 'checking', currency: 'AUD' });
  const seed = (accountName: string, amountCents: number) =>
    createTransaction(opened.db, {
      description: 'seed',
      accountId: resolveAccountIdByName(opened.db, accountName),
      date: '2026-07-01',
      type: 'transfer',
      amountCents,
    });
  return { ...opened, debit: seed('Bendigo', -5000), credit: seed('ING', 5000) };
}

describe('pairSavedTransfer', () => {
  it('returns the re-read row carrying the link when the counterpart exists', () => {
    const { db, debit, credit } = seededPair();

    const saved = pairSavedTransfer(db, debit);

    expect(saved.id).toBe(debit.id);
    expect(saved.relatedTransactionId).toBe(credit.id);
  });

  it('logs and returns the saved row untouched when the pairing read throws', () => {
    const { db, raw, debit } = seededPair();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    raw.close();

    const saved = pairSavedTransfer(db, debit);

    expect(saved).toBe(debit);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toContain(debit.id);
  });

  it('does not read the database at all while the flag is off', () => {
    const { db, raw, debit } = seededPair();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env[ENABLED];
    raw.close();

    expect(pairSavedTransfer(db, debit)).toBe(debit);
    expect(logged).not.toHaveBeenCalled();
  });

  it('does not read the database for a row that is not a transfer', () => {
    const { db, raw, debit } = seededPair();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    raw.close();

    expect(pairSavedTransfer(db, { ...debit, type: 'purchase' })).toEqual({
      ...debit,
      type: 'purchase',
    });
    expect(logged).not.toHaveBeenCalled();
  });
});
