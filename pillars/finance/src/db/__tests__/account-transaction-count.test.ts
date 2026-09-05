/**
 * `transactionCountsFor` against the migrated finance schema (POPS-2924): the
 * batched read `project-accounts.ts` wires into every accounts response.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { transactionCountsFor } from '../services/account-transaction-count.js';
import { createAccount } from '../services/accounts.js';
import { createTransaction } from '../services/transactions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
});

describe('transactionCountsFor', () => {
  it('returns an empty map for an empty id list', () => {
    expect(transactionCountsFor(db, [])).toEqual(new Map());
  });

  it('maps an account with no transactions to zero rather than omitting it', () => {
    const accountId = createAccount(db, { name: 'Empty', kind: 'cash', currency: 'AUD' }).id;

    expect(transactionCountsFor(db, [accountId])).toEqual(new Map([[accountId, 0]]));
  });

  it('counts every transaction, pending and transfer rows included', () => {
    const accountId = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' }).id;
    createTransaction(db, {
      description: 'a',
      accountId,
      amountCents: -500,
      date: '2026-01-01',
      type: 'purchase',
    });
    createTransaction(db, {
      description: 'b',
      accountId,
      amountCents: -1000,
      date: '2026-01-02',
      type: 'transfer',
    });

    expect(transactionCountsFor(db, [accountId])).toEqual(new Map([[accountId, 2]]));
  });

  it('keeps each account to its own count in one batched call', () => {
    const a = createAccount(db, { name: 'Alpha', kind: 'cash', currency: 'AUD' }).id;
    const b = createAccount(db, { name: 'Beta', kind: 'cash', currency: 'AUD' }).id;
    createTransaction(db, {
      description: 'a1',
      accountId: a,
      amountCents: -500,
      date: '2026-01-01',
    });
    createTransaction(db, {
      description: 'a2',
      accountId: a,
      amountCents: -500,
      date: '2026-01-02',
    });

    expect(transactionCountsFor(db, [a, b])).toEqual(
      new Map([
        [a, 2],
        [b, 0],
      ])
    );
  });
});
