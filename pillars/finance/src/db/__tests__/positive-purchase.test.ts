/**
 * The one invariant POPS-2685 adds: a row may not carry `type = 'purchase'`
 * with a positive amount.
 *
 * The whole risk in this guard is writing it too wide. "A positive amount may
 * not carry a spend type" would be wrong — `refund` is in
 * `SPEND_TRANSACTION_TYPES` and a positive refund is an expense offset that
 * the live ledger holds two of, correctly. So the accepted cases below are not
 * padding: each one is a row that exists today and that a wider rule would
 * start rejecting. They fail if anyone widens the predicate.
 *
 * Every case goes through a real write path — `createTransaction`,
 * `updateTransaction` or `insertImportTransaction` — rather than calling
 * `isPositiveAmountPurchase` directly, because a predicate nothing reaches is
 * the failure mode this ticket exists to close (POPS-2680 sat on four bad rows
 * for months with a correct classifier upstream of them).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { PositiveAmountPurchaseError } from '../errors.js';
import { resolveAccountIdByName } from '../services/account-lookup.js';
import { createAccount } from '../services/accounts.js';
import { insertImportTransaction, settleImportedTransaction } from '../services/imports.js';
import { createTransaction, getTransaction, updateTransaction } from '../services/transactions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let accountId: string;

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
  createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' });
  accountId = resolveAccountIdByName(db, 'Everyday');
});

function create(amountCents: number, type: TransactionType | undefined): string {
  return createTransaction(db, {
    description: 'A row',
    accountId,
    amountCents,
    date: '2026-01-02',
    ...(type === undefined ? {} : { type }),
  }).id;
}

describe('createTransaction', () => {
  it('refuses a positive purchase, naming the amount and the type', () => {
    expect(() => create(50_000, 'purchase')).toThrow(PositiveAmountPurchaseError);
    expect(() => create(50_000, 'purchase')).toThrow(/50000 cents/);
    expect(() => create(50_000, 'purchase')).toThrow(/purchase/);
  });

  // `type` defaults to 'purchase' when the caller supplies none, so an
  // untyped credit would otherwise become the exact row this guard refuses.
  it('refuses a positive amount with no type at all, because the default is purchase', () => {
    expect(() => create(50_000, undefined)).toThrow(PositiveAmountPurchaseError);
  });

  it.each<[TransactionType, string]>([
    ['refund', 'a positive refund is an expense offset, not income'],
    ['rebate', 'money genuinely arriving'],
    ['income', 'money genuinely arriving'],
    ['transfer', 'the receiving side of a movement'],
    ['reversal', 'a spend type that is legitimately positive'],
  ])('accepts a positive %s — %s', (type) => {
    expect(() => create(50_000, type)).not.toThrow();
  });

  it.each([-4500, 0])('accepts a purchase of %d cents', (amountCents) => {
    expect(() => create(amountCents, 'purchase')).not.toThrow();
  });
});

describe('updateTransaction', () => {
  // The POPS-2680 shape exactly: their match_type is prefix/learned/manual, so
  // they were retyped after the fact rather than created wrong. A zod
  // refinement on the PATCH body cannot see this — `amount` and `type` are
  // independently optional, so `{ type: 'purchase' }` is a valid body on its
  // own and the contradicting amount lives in the stored row.
  it('refuses retyping a stored positive row to purchase, with no amount in the patch', () => {
    const id = create(50_000, 'income');
    expect(() => updateTransaction(db, id, { type: 'purchase' })).toThrow(
      PositiveAmountPurchaseError
    );
  });

  it('refuses flipping a stored purchase to a positive amount, with no type in the patch', () => {
    const id = create(-4500, 'purchase');
    expect(() => updateTransaction(db, id, { amountCents: 50_000 })).toThrow(
      PositiveAmountPurchaseError
    );
  });

  it('accepts a patch that changes both together into a coherent pair', () => {
    const id = create(-4500, 'purchase');
    expect(() => updateTransaction(db, id, { amountCents: 50_000, type: 'refund' })).not.toThrow();
  });

  it('accepts retyping a stored negative row to purchase', () => {
    const id = create(-4500, 'income');
    expect(updateTransaction(db, id, { type: 'purchase' }).type).toBe('purchase');
  });

  // The guard runs before any column is written, so a patch carrying one
  // legal change and one illegal one must land none of them — a partial write
  // would leave the row edited and the caller told it failed.
  it('writes nothing at all when it refuses a mixed patch', () => {
    const id = create(50_000, 'income');
    expect(() => updateTransaction(db, id, { description: 'Edited', type: 'purchase' })).toThrow(
      PositiveAmountPurchaseError
    );

    const stored = getTransaction(db, id);
    expect(stored.description).toBe('A row');
    expect(stored.type).toBe('income');
  });
});

describe('insertImportTransaction', () => {
  function importRow(amountCents: number, type: TransactionType): () => unknown {
    return () =>
      insertImportTransaction(db, {
        description: 'AN IMPORTED ROW',
        dialectAccountLabel: 'Everyday',
        amountCents,
        date: '2026-01-02',
        type,
        tags: [],
        entityId: null,
        entityName: null,
        location: null,
      });
  }

  it('refuses a positive purchase, so a bad row cannot ride in on an atomic commit', () => {
    expect(importRow(50_000, 'purchase')).toThrow(PositiveAmountPurchaseError);
  });

  it('accepts a positive refund — the shape a real return takes', () => {
    expect(importRow(50_000, 'refund')).not.toThrow();
  });

  it('accepts a negative purchase', () => {
    expect(importRow(-4500, 'purchase')).not.toThrow();
  });
});

/**
 * A settlement is the one write that changes an amount without touching the
 * type, so it is the only one that can produce the contradiction without
 * anybody choosing to — the source settling a held card authorisation at the
 * opposite sign. It refuses rather than guessing a replacement type, and the
 * row keeps its pending flag so the next sync offers it again.
 */
describe('settleImportedTransaction', () => {
  it('refuses a settlement that would make a held purchase positive', () => {
    const id = create(-4500, 'purchase');
    expect(() =>
      settleImportedTransaction(db, id, {
        date: '2026-01-03',
        amountCents: 4500,
        rawRow: 'settled',
      })
    ).toThrow(PositiveAmountPurchaseError);
  });

  it('leaves the refused row held, so the next sync offers it again', () => {
    const id = create(-4500, 'purchase');
    try {
      settleImportedTransaction(db, id, {
        date: '2026-01-03',
        amountCents: 4500,
        rawRow: 'settled',
      });
    } catch {
      // asserted above
    }
    const stored = getTransaction(db, id);
    expect(stored.amountCents).toBe(-4500);
    expect(stored.date).toBe('2026-01-02');
  });

  it('settles a held refund at a positive amount, which is what a return looks like', () => {
    const id = create(-4500, 'refund');
    settleImportedTransaction(db, id, { date: '2026-01-03', amountCents: 4500, rawRow: 'settled' });
    expect(getTransaction(db, id).amountCents).toBe(4500);
  });

  it('settles a purchase at a larger negative amount', () => {
    const id = create(-4500, 'purchase');
    settleImportedTransaction(db, id, {
      date: '2026-01-03',
      amountCents: -5000,
      rawRow: 'settled',
    });
    expect(getTransaction(db, id).amountCents).toBe(-5000);
  });
});
