import { describe, expect, it } from 'vitest';

import { transactionChanged } from '../reevaluate-diff.js';

import type { ProcessedTransaction } from '../types.js';

function txn(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -42.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    status: 'matched',
    entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' },
    ...overrides,
  };
}

describe('transactionChanged', () => {
  it('reports unchanged for two identical transactions with no bucket move', () => {
    expect(transactionChanged(txn(), txn())).toBe(false);
  });

  it('reports changed on a bucket move (matched -> uncertain)', () => {
    expect(transactionChanged(txn(), txn(), 'matched', 'uncertain')).toBe(true);
  });

  it('ignores identical buckets even when both are supplied', () => {
    expect(transactionChanged(txn(), txn(), 'matched', 'matched')).toBe(false);
  });

  it('ignores bucket args when only one side is supplied', () => {
    expect(transactionChanged(txn(), txn(), 'matched', undefined)).toBe(false);
  });

  it('reports changed on a status flip', () => {
    expect(transactionChanged(txn({ status: 'matched' }), txn({ status: 'uncertain' }))).toBe(true);
  });

  it('reports changed on a transactionType change', () => {
    expect(
      transactionChanged(txn({ transactionType: 'purchase' }), txn({ transactionType: 'transfer' }))
    ).toBe(true);
  });

  it('reports changed on an entityId change', () => {
    expect(
      transactionChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-2', entityName: 'Woolworths', matchType: 'exact' } })
      )
    ).toBe(true);
  });

  it('reports changed on an entityName change (same entityId)', () => {
    expect(
      transactionChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolies', matchType: 'exact' } })
      )
    ).toBe(true);
  });

  it('reports changed on a matchType change alone', () => {
    expect(
      transactionChanged(
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' } }),
        txn({ entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'learned' } })
      )
    ).toBe(true);
  });

  it('reports unchanged when neither entity has an id or name (both no-match)', () => {
    expect(
      transactionChanged(
        txn({ entity: { matchType: 'none' } }),
        txn({ entity: { matchType: 'none' } })
      )
    ).toBe(false);
  });
});
