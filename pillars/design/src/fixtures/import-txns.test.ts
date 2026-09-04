import { byBucket, droppedRows, importTxns, type ImportTxn } from '@/fixtures/import-txns';
import { describe, expect, it } from 'vitest';

function txn(overrides: Partial<ImportTxn>): ImportTxn {
  return {
    checksum: 'x',
    date: '2026-01-01',
    description: 'Test',
    amount: -10,
    account: 'Amex',
    bucket: 'matched',
    rawRow: '{}',
    ...overrides,
  };
}

describe('byBucket', () => {
  it('partitions the fixture rows by bucket', () => {
    for (const row of importTxns) {
      expect(byBucket(row.bucket)).toContainEqual(row);
    }
  });

  it('returns nothing for a bucket with no rows in the passed set', () => {
    expect(byBucket('failed').every((row) => row.bucket === 'failed')).toBe(true);
  });
});

describe('droppedRows', () => {
  it('drops an untyped credit', () => {
    const rows = [txn({ amount: 22, transactionType: undefined })];
    expect(droppedRows(rows)).toEqual(rows);
  });

  it('does not drop a typed credit', () => {
    const rows = [txn({ amount: 22, transactionType: 'income' })];
    expect(droppedRows(rows)).toEqual([]);
  });

  it('drops a purchase/refund debit with no resolved entity', () => {
    const purchase = txn({ amount: -10, transactionType: 'purchase', entity: undefined });
    const refund = txn({ amount: -10, transactionType: 'refund', entity: undefined });
    expect(droppedRows([purchase, refund])).toEqual([purchase, refund]);
  });

  it('does not drop a purchase/refund once an entity is resolved', () => {
    const rows = [
      txn({
        amount: -10,
        transactionType: 'purchase',
        entity: { name: 'Woolworths', matchType: 'exact' },
      }),
    ];
    expect(droppedRows(rows)).toEqual([]);
  });

  it('does not drop a transfer or an unresolved-type row with no entity, since neither is a purchase/refund', () => {
    const rows = [
      txn({ amount: -10, transactionType: 'transfer', entity: undefined }),
      txn({ amount: -10, transactionType: undefined, entity: undefined }),
    ];
    expect(droppedRows(rows)).toEqual([]);
  });

  it('never drops a row outside the matched bucket, even if it would otherwise qualify', () => {
    const rows = [txn({ amount: 22, transactionType: undefined, bucket: 'uncertain' })];
    expect(droppedRows(rows)).toEqual([]);
  });
});
