/**
 * The soft-URI service trio, against a real on-disk purchases.db so the
 * `selectDistinct` / `UPDATE … WHERE uri = ?` SQL is exercised rather than
 * mocked.
 *
 * The scenarios that matter are the ones where a URI is NOT 1:1 with a row:
 * a quantity-3 line has three distinct unit references, and one document
 * can be attached to several orders. Marking has to reach every row a URI
 * touches and no others, or a stale reference stays rendered as live
 * somewhere else on the page.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearDocumentUriStale,
  clearInventoryItemUriStale,
  createPurchase,
  listDistinctDocumentUris,
  listDistinctInventoryItemUris,
  markDocumentUriStale,
  markInventoryItemUriStale,
  purchaseDocuments,
  purchaseItemUnits,
} from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

const NOW = '2026-08-08T09:00:00.000Z';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

function seedUnits(uris: readonly (string | undefined)[]): void {
  createPurchase(
    opened.db,
    amazonOrder({
      totalCents: 15000,
      items: [
        {
          name: 'Nanoleaf bulb',
          quantity: uris.length,
          unitPriceCents: 5000,
          lineTotalCents: 15000,
          kind: 'durable',
          units: uris.map((uri, index) => ({
            serialNumber: `SN-${String(index)}`,
            ...(uri === undefined ? {} : { inventoryItemUri: uri }),
          })),
        },
      ],
    })
  );
}

function seedDocuments(uris: readonly string[], overrides: { sourceOrderId?: string } = {}): void {
  createPurchase(
    opened.db,
    amazonOrder({
      ...overrides,
      ...(overrides.sourceOrderId === undefined
        ? {}
        : { checksum: `amazon:${overrides.sourceOrderId}` }),
      documents: uris.map((uri) => ({ documentUri: uri, kind: 'tax_invoice' as const })),
    })
  );
}

function unitStaleAt(uri: string): (string | null)[] {
  return opened.db
    .select({ staleAt: purchaseItemUnits.inventoryItemStaleAt })
    .from(purchaseItemUnits)
    .where(eq(purchaseItemUnits.inventoryItemUri, uri))
    .all()
    .map((row) => row.staleAt);
}

function documentStaleAt(uri: string): (string | null)[] {
  return opened.db
    .select({ staleAt: purchaseDocuments.documentStaleAt })
    .from(purchaseDocuments)
    .where(eq(purchaseDocuments.documentUri, uri))
    .all()
    .map((row) => row.staleAt);
}

describe('listDistinctInventoryItemUris', () => {
  it('returns nothing for a database with no unit references', () => {
    seedUnits([undefined, undefined]);

    expect(listDistinctInventoryItemUris(opened.db)).toEqual([]);
  });

  it('skips units with no reference and de-duplicates the rest', () => {
    seedUnits(['pops://inventory/item/1', undefined, 'pops://inventory/item/1']);

    expect(listDistinctInventoryItemUris(opened.db)).toEqual(['pops://inventory/item/1']);
  });

  it('returns one entry per distinct reference on a multi-unit line', () => {
    seedUnits(['pops://inventory/item/1', 'pops://inventory/item/2', 'pops://inventory/item/3']);

    expect(listDistinctInventoryItemUris(opened.db).toSorted()).toEqual([
      'pops://inventory/item/1',
      'pops://inventory/item/2',
      'pops://inventory/item/3',
    ]);
  });
});

describe('markInventoryItemUriStale / clearInventoryItemUriStale', () => {
  it('stamps every unit sharing the URI and leaves the others alone', () => {
    seedUnits(['pops://inventory/item/1', 'pops://inventory/item/1', 'pops://inventory/item/2']);

    expect(markInventoryItemUriStale(opened.db, 'pops://inventory/item/1', NOW)).toBe(2);
    expect(unitStaleAt('pops://inventory/item/1')).toEqual([NOW, NOW]);
    expect(unitStaleAt('pops://inventory/item/2')).toEqual([null]);
  });

  it('reports zero rows for a URI no unit references', () => {
    seedUnits(['pops://inventory/item/1']);

    expect(markInventoryItemUriStale(opened.db, 'pops://inventory/item/9', NOW)).toBe(0);
  });

  it('is idempotent — re-marking moves the timestamp rather than duplicating', () => {
    seedUnits(['pops://inventory/item/1']);
    markInventoryItemUriStale(opened.db, 'pops://inventory/item/1', NOW);

    markInventoryItemUriStale(opened.db, 'pops://inventory/item/1', '2026-08-09T09:00:00.000Z');

    expect(unitStaleAt('pops://inventory/item/1')).toEqual(['2026-08-09T09:00:00.000Z']);
  });

  it('un-stales a reference that resolves again', () => {
    seedUnits(['pops://inventory/item/1', 'pops://inventory/item/1']);
    markInventoryItemUriStale(opened.db, 'pops://inventory/item/1', NOW);

    expect(clearInventoryItemUriStale(opened.db, 'pops://inventory/item/1')).toBe(2);
    expect(unitStaleAt('pops://inventory/item/1')).toEqual([null, null]);
  });
});

describe('listDistinctDocumentUris', () => {
  it('returns nothing for a database with no documents', () => {
    createPurchase(opened.db, amazonOrder());

    expect(listDistinctDocumentUris(opened.db)).toEqual([]);
  });

  it('de-duplicates one document attached to two orders', () => {
    const shared = 'pops://documents/document/7';
    seedDocuments([shared]);
    seedDocuments([shared], { sourceOrderId: '111-2222222-3333333' });

    expect(listDistinctDocumentUris(opened.db)).toEqual([shared]);
    expect(documentStaleAt(shared)).toHaveLength(2);
  });
});

describe('markDocumentUriStale / clearDocumentUriStale', () => {
  it('stamps every order the document is attached to', () => {
    const shared = 'pops://documents/document/7';
    seedDocuments([shared, 'pops://documents/document/8']);
    seedDocuments([shared], { sourceOrderId: '111-2222222-3333333' });

    expect(markDocumentUriStale(opened.db, shared, NOW)).toBe(2);
    expect(documentStaleAt(shared)).toEqual([NOW, NOW]);
    expect(documentStaleAt('pops://documents/document/8')).toEqual([null]);
  });

  it('un-stales a document that resolves again', () => {
    const uri = 'pops://documents/document/7';
    seedDocuments([uri]);
    markDocumentUriStale(opened.db, uri, NOW);

    expect(clearDocumentUriStale(opened.db, uri)).toBe(1);
    expect(documentStaleAt(uri)).toEqual([null]);
  });
});
