/**
 * The settle half of the Up write path (POPS-2685): a settlement the
 * positive-purchase guard refuses is isolated to its own row and reported by
 * id, and anything else that goes wrong still propagates.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { PositiveAmountPurchaseError } from '../../../../db/errors.js';
import { transactions } from '../../../../db/schema.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { insertImportTransaction } from '../../../../db/services/imports.js';
import { toParsedTransaction } from '../map-transaction.js';
import { settleMappedRows } from '../write-rows.js';
import { upTransaction } from './fixtures.js';

import type Database from 'better-sqlite3';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { SettleableRow } from '../sync-plan.js';

let db: FinanceDb;
let raw: Database.Database;
let accountId: string;

const ACCOUNT_LABEL = 'Up Everyday';

/** A stored `purchase` the ledger still holds as pending, awaiting Up's settlement. */
function heldPurchase(description: string, amountCents: number): string {
  return insertImportTransaction(db, {
    description,
    dialectAccountLabel: ACCOUNT_LABEL,
    accountId,
    amountCents,
    date: '2026-09-01',
    type: 'purchase',
    tags: [],
    entityId: null,
    entityName: null,
    location: null,
    pending: true,
  }).id;
}

/** What Up settled that stored row to. */
function settlesTo(upId: string, cents: number, transactionId: string): SettleableRow {
  return {
    transactionId,
    mapped: toParsedTransaction(
      upTransaction({
        id: upId,
        status: 'SETTLED',
        cents,
        createdAt: '2026-09-01T09:00:00+10:00',
        settledAt: '2026-09-03T09:00:00+10:00',
      }),
      { accountId, accountLabel: ACCOUNT_LABEL }
    ),
  };
}

function storedById(): Record<string, { pending: boolean; amountCents: number; date: string }> {
  const rows = db
    .select({
      id: transactions.id,
      pending: transactions.pending,
      amountCents: transactions.amountCents,
      date: transactions.date,
    })
    .from(transactions)
    .all();
  return Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest]));
}

beforeEach(() => {
  ({ db, raw } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: ACCOUNT_LABEL, kind: 'savings', currency: 'AUD' }).id;
});

describe('settleMappedRows', () => {
  it('settles the rows either side of a refused one and names both sets by id', () => {
    const before = heldPurchase('Fuel', -1_000);
    const contradicted = heldPurchase('Coffee', -2_000);
    const after = heldPurchase('Groceries', -3_000);

    const result = settleMappedRows(db, [
      settlesTo('a', -1_100, before),
      settlesTo('b', 2_000, contradicted),
      settlesTo('c', -3_300, after),
    ]);

    expect(result).toEqual({ settled: [before, after], refused: [contradicted] });
    expect(storedById()).toEqual({
      [before]: { pending: false, amountCents: -1_100, date: '2026-09-03' },
      [contradicted]: { pending: true, amountCents: -2_000, date: '2026-09-01' },
      [after]: { pending: false, amountCents: -3_300, date: '2026-09-03' },
    });
  });

  it('propagates a failure that is not a refusal instead of counting it as one', () => {
    const id = heldPurchase('Fuel', -1_000);
    const settleable = [settlesTo('a', -1_100, id)];
    raw.close();

    let thrown: unknown;
    try {
      settleMappedRows(db, settleable);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(PositiveAmountPurchaseError);
  });
});
