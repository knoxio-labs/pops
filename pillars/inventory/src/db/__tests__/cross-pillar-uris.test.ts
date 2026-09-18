/**
 * Tests for the cross-pillar URI denormalisation service helpers.
 * Pure DB + service layer.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { crossPillarUrisService } from '../index.js';
import { items } from '../schema.js';
import { openMigratedTestDb } from './migrated-db.js';

import type { InventoryDb } from '../services/internal.js';

function freshDb(): InventoryDb {
  return openMigratedTestDb().db;
}

function seed(
  db: InventoryDb,
  id: string,
  row: { purchase?: string | null; transactionId?: string | null } = {}
): void {
  db.insert(items)
    .values({
      id,
      name: `item-${id}`,
      placementKind: 'hand',
      seq: 0,
      lastEditedTime: '2026-06-15T00:00:00.000Z',
      purchaseTransactionId: row.transactionId ?? null,
      purchaseTransactionUri: row.purchase ?? null,
    })
    .run();
}

describe('crossPillarUrisService.purchaseTransactionUriFor', () => {
  it('produces the same shape the backfill migration wrote', () => {
    expect(crossPillarUrisService.purchaseTransactionUriFor('tx-1')).toBe(
      'pops://finance/transaction/tx-1'
    );
  });

  it('has no uri for an absent, null or empty id', () => {
    expect(crossPillarUrisService.purchaseTransactionUriFor(null)).toBeNull();
    expect(crossPillarUrisService.purchaseTransactionUriFor(undefined)).toBeNull();
    expect(crossPillarUrisService.purchaseTransactionUriFor('')).toBeNull();
  });
});

describe('crossPillarUrisService.countRowsMissingPurchaseTransactionUri', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('counts rows that name a transaction but carry no uri for it', () => {
    seed(db, 'a', { transactionId: 'tx-a' });
    seed(db, 'b', { transactionId: 'tx-b' });
    expect(crossPillarUrisService.countRowsMissingPurchaseTransactionUri(db)).toBe(2);
  });

  it('counts nothing when every named transaction has its derived uri', () => {
    seed(db, 'a', { transactionId: 'tx-a', purchase: 'pops://finance/transaction/tx-a' });
    seed(db, 'b');
    expect(crossPillarUrisService.countRowsMissingPurchaseTransactionUri(db)).toBe(0);
  });

  it('does not count an empty-string transaction id as a missing reference', () => {
    seed(db, 'a', { transactionId: '' });
    expect(crossPillarUrisService.countRowsMissingPurchaseTransactionUri(db)).toBe(0);
  });

  it('counts nothing on an empty table rather than throwing', () => {
    expect(crossPillarUrisService.countRowsMissingPurchaseTransactionUri(db)).toBe(0);
  });
});

describe('crossPillarUrisService.listDistinct*', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns distinct non-null purchase transaction URIs', () => {
    seed(db, 'a', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'b', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'c', { purchase: 'pops://finance/transaction/y' });
    seed(db, 'd');

    const uris = crossPillarUrisService.listDistinctPurchaseTransactionUris(db);
    expect(uris.toSorted()).toEqual([
      'pops://finance/transaction/x',
      'pops://finance/transaction/y',
    ]);
  });
});

describe('crossPillarUrisService.markStale / clearStale', () => {
  let db: InventoryDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('stamps every row pointing at the URI when marking purchase stale', () => {
    seed(db, 'a', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'b', { purchase: 'pops://finance/transaction/x' });
    seed(db, 'c', { purchase: 'pops://finance/transaction/y' });

    const stamp = '2026-06-15T03:30:00.000Z';
    const changed = crossPillarUrisService.markPurchaseTransactionUriStale(
      db,
      'pops://finance/transaction/x',
      stamp
    );

    expect(changed).toBe(2);
    const stamps = db
      .select({
        id: items.id,
        s: items.purchaseTransactionStaleAt,
      })
      .from(items)
      .all();
    expect(stamps.find((r) => r.id === 'a')?.s).toBe(stamp);
    expect(stamps.find((r) => r.id === 'b')?.s).toBe(stamp);
    expect(stamps.find((r) => r.id === 'c')?.s).toBeNull();
  });

  it('clears purchase stale markers when the URI resolves again', () => {
    seed(db, 'a', { purchase: 'pops://finance/transaction/x' });
    crossPillarUrisService.markPurchaseTransactionUriStale(
      db,
      'pops://finance/transaction/x',
      '2026-06-14T00:00:00.000Z'
    );
    const cleared = crossPillarUrisService.clearPurchaseTransactionUriStale(
      db,
      'pops://finance/transaction/x'
    );
    expect(cleared).toBe(1);
    const stamps = db.select({ s: items.purchaseTransactionStaleAt }).from(items).all();
    expect(stamps[0]?.s).toBeNull();
  });
});
