/**
 * The balance module against the migrated finance schema (POPS-2879,
 * ADR-051): forward and backward anchoring, the unanchored fallback, the
 * end-of-day boundary, expected-vs-actual, and the month-end trend.
 *
 * Every figure asserted here is ledger-signed. The liability suite is
 * Amex-shaped on purpose — purchases negative, payment positive, checkpoint
 * negative — because a sign error in the anchor arithmetic is invisible on an
 * asset account where every number is already positive.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  balanceAsOf,
  balanceHistory,
  checkpointDelta,
  dayBefore,
  isAccountInconsistent,
} from '../services/account-balance.js';
import { insertCheckpoint } from '../services/account-checkpoints.js';
import { createAccount } from '../services/accounts.js';
import { createTransaction } from '../services/transactions.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let accountId: string;

function tx(date: string, amountCents: number): void {
  createTransaction(db, { description: `tx ${date}`, accountId, amountCents, date });
}

function checkpoint(asOf: string, balanceCents: number): string {
  return insertCheckpoint(db, { accountId, balanceCents, asOf, source: 'manual' }).id;
}

beforeEach(() => {
  db = freshMigratedFinanceDb().db;
  accountId = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' }).id;
});

describe('balanceAsOf without a checkpoint', () => {
  it('is the plain sum, and says so', () => {
    tx('2026-01-10', 5_000);
    tx('2026-02-10', -1_500);

    const balance = balanceAsOf(db, accountId, '2026-03-01');
    expect(balance).toMatchObject({
      balanceCents: 3_500,
      asOf: '2026-03-01',
      basis: 'transactions',
      anchor: null,
      inconsistent: false,
    });
  });

  it('excludes transactions after the date asked for', () => {
    tx('2026-01-10', 5_000);
    tx('2026-02-10', -1_500);

    expect(balanceAsOf(db, accountId, '2026-01-31').balanceCents).toBe(5_000);
  });

  it('is zero for an account with nothing on it', () => {
    expect(balanceAsOf(db, accountId, '2026-01-01').balanceCents).toBe(0);
  });
});

describe('balanceAsOf anchored forwards', () => {
  beforeEach(() => {
    // Rows on BOTH sides of the checkpoint: the ones before it must not move
    // the balance, the ones after it must.
    tx('2025-06-01', 999_999);
    tx('2026-01-15', -4_000);
    checkpoint('2026-01-31', 100_000);
    tx('2026-02-05', -2_500);
    tx('2026-02-20', 1_000);
  });

  it('adds only the transactions after the anchor', () => {
    const balance = balanceAsOf(db, accountId, '2026-02-28');
    expect(balance.balanceCents).toBe(98_500);
    expect(balance.basis).toBe('checkpoint');
    expect(balance.anchor).toMatchObject({ asOf: '2026-01-31', source: 'manual' });
  });

  it('ignores transactions dated before the earliest checkpoint entirely', () => {
    expect(balanceAsOf(db, accountId, '2026-01-31').balanceCents).toBe(100_000);
  });

  it('counts a transaction dated ON the checkpoint date as inside it', () => {
    tx('2026-01-31', -50_000);
    expect(balanceAsOf(db, accountId, '2026-01-31').balanceCents).toBe(100_000);
  });

  it('counts a transaction dated the day after the checkpoint as outside it', () => {
    tx('2026-02-01', -50_000);
    expect(balanceAsOf(db, accountId, '2026-02-01').balanceCents).toBe(50_000);
  });

  it('anchors on the nearest earlier checkpoint when several exist', () => {
    checkpoint('2026-02-10', 90_000);
    expect(balanceAsOf(db, accountId, '2026-02-28')).toMatchObject({
      balanceCents: 91_000,
      anchor: { asOf: '2026-02-10' },
    });
  });
});

describe('balanceAsOf anchored backwards', () => {
  beforeEach(() => {
    tx('2025-11-10', 3_000);
    tx('2025-12-20', -800);
    checkpoint('2026-01-31', 100_000);
    tx('2026-02-05', -2_500);
  });

  it('unwinds the transactions between the date and the checkpoint ahead of it', () => {
    // 100_000 less the -800 that landed in December: 100_800 at 2025-11-30.
    const balance = balanceAsOf(db, accountId, '2025-11-30');
    expect(balance.balanceCents).toBe(100_800);
    expect(balance.basis).toBe('checkpoint');
    expect(balance.anchor).toMatchObject({ asOf: '2026-01-31' });
  });

  it('does not let a transaction after the anchor leak into a backward reading', () => {
    expect(balanceAsOf(db, accountId, '2025-12-31').balanceCents).toBe(100_000);
  });
});

describe('balanceAsOf on a liability', () => {
  let card: string;

  beforeEach(() => {
    card = createAccount(db, { name: 'Amex Platinum', kind: 'credit-card', currency: 'AUD' }).id;
    const spend = (date: string, amountCents: number): void => {
      createTransaction(db, { description: `card ${date}`, accountId: card, amountCents, date });
    };
    spend('2026-08-14', -12_000);
    insertCheckpoint(db, {
      accountId: card,
      balanceCents: -213_755,
      asOf: '2026-09-02',
      source: 'statement',
      sourceRef: 'amex-sep',
    });
    spend('2026-09-05', -4_500);
    spend('2026-09-08', 50_000);
  });

  it('stays negative and moves the right way for spend and payment', () => {
    expect(balanceAsOf(db, card, '2026-09-10').balanceCents).toBe(-168_255);
  });

  it('is the checkpoint itself on the checkpoint date', () => {
    expect(balanceAsOf(db, card, '2026-09-02').balanceCents).toBe(-213_755);
  });
});

describe('checkpointDelta', () => {
  it('is null for the earliest checkpoint — it anchors and cannot disagree', () => {
    // A million cents of history before it, none of which it has to explain.
    tx('2025-01-01', 1_000_000);
    const earliest = insertCheckpoint(db, {
      accountId,
      balanceCents: 100_000,
      asOf: '2026-01-31',
      source: 'manual',
    });
    insertCheckpoint(db, {
      accountId,
      balanceCents: 100_000,
      asOf: '2026-02-28',
      source: 'manual',
    });

    expect(checkpointDelta(db, earliest)).toBeNull();
  });

  it('is zero when the ledger explains the move between two checkpoints', () => {
    checkpoint('2026-01-31', 100_000);
    tx('2026-02-10', -2_500);
    const second = insertCheckpoint(db, {
      accountId,
      balanceCents: 97_500,
      asOf: '2026-02-28',
      source: 'manual',
    });

    expect(checkpointDelta(db, second)).toEqual({
      expectedBalanceCents: 97_500,
      deltaCents: 0,
    });
    expect(isAccountInconsistent(db, accountId)).toBe(false);
  });

  it('is non-zero when a transaction between the two is missing, and clears when it is added', () => {
    checkpoint('2026-01-31', 100_000);
    const second = insertCheckpoint(db, {
      accountId,
      balanceCents: 97_500,
      asOf: '2026-02-28',
      source: 'manual',
    });

    expect(checkpointDelta(db, second)).toEqual({
      expectedBalanceCents: 100_000,
      deltaCents: -2_500,
    });
    expect(isAccountInconsistent(db, accountId)).toBe(true);
    expect(balanceAsOf(db, accountId, '2026-03-01').inconsistent).toBe(true);

    // The missing row arrives. Nothing is written to either checkpoint.
    tx('2026-02-10', -2_500);

    expect(checkpointDelta(db, second)?.deltaCents).toBe(0);
    expect(isAccountInconsistent(db, accountId)).toBe(false);
  });

  it('signs the delta from the checkpoint point of view on a liability', () => {
    const card = createAccount(db, { name: 'Amex Gold', kind: 'credit-card', currency: 'AUD' }).id;
    insertCheckpoint(db, {
      accountId: card,
      balanceCents: -100_000,
      asOf: '2026-01-31',
      source: 'manual',
    });
    const second = insertCheckpoint(db, {
      accountId: card,
      balanceCents: -150_000,
      asOf: '2026-02-28',
      source: 'manual',
    });

    // The ledger has no February spend, so it expects the balance unchanged;
    // the card says $500 more is owed than the rows account for.
    expect(checkpointDelta(db, second)).toEqual({
      expectedBalanceCents: -100_000,
      deltaCents: -50_000,
    });
  });
});

describe('isAccountInconsistent', () => {
  it('is false for an account with no checkpoints at all', () => {
    tx('2026-01-01', 1_000);
    expect(isAccountInconsistent(db, accountId)).toBe(false);
  });

  it('follows only the latest checkpoint — an older flag is re-anchored away', () => {
    checkpoint('2026-01-31', 100_000);
    checkpoint('2026-02-28', 97_500); // disagrees: no rows explain the -2500
    expect(isAccountInconsistent(db, accountId)).toBe(true);

    checkpoint('2026-03-31', 97_500); // agrees with the one before it
    expect(isAccountInconsistent(db, accountId)).toBe(false);
    expect(balanceAsOf(db, accountId, '2026-04-01').inconsistent).toBe(false);
  });
});

describe('balanceHistory', () => {
  it('returns one point per month, oldest first, ending in the month asked for', () => {
    const history = balanceHistory(db, accountId, 12, '2026-09-15');
    expect(history).toHaveLength(12);
    expect(history[0]?.month).toBe('2025-10');
    expect(history.at(-1)?.month).toBe('2026-09');
  });

  it('matches balanceAsOf point for point, anchored and unanchored alike', () => {
    tx('2025-11-05', 20_000);
    tx('2026-01-15', -4_000);
    checkpoint('2026-02-28', 100_000);
    tx('2026-04-10', -2_500);
    tx('2026-06-01', 7_000);

    const history = balanceHistory(db, accountId, 12, '2026-09-15');
    for (const point of history) {
      const end = new Date(
        Date.UTC(Number(point.month.slice(0, 4)), Number(point.month.slice(5, 7)), 0)
      )
        .toISOString()
        .slice(0, 10);
      expect(point.balanceCents).toBe(balanceAsOf(db, accountId, end).balanceCents);
    }
  });

  it('carries the running total through a month with no transactions', () => {
    tx('2026-01-10', 5_000);
    const history = balanceHistory(db, accountId, 4, '2026-04-15');
    expect(history.map((p) => p.balanceCents)).toEqual([5_000, 5_000, 5_000, 5_000]);
  });

  it('is all zeroes for an account with nothing on it', () => {
    expect(balanceHistory(db, accountId, 3, '2026-03-15').map((p) => p.balanceCents)).toEqual([
      0, 0, 0,
    ]);
  });
});

describe('dayBefore', () => {
  it('steps back one day', () => {
    expect(dayBefore('2026-03-02')).toBe('2026-03-01');
  });

  it('crosses a month boundary', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });

  it('crosses a leap day', () => {
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
  });
});
