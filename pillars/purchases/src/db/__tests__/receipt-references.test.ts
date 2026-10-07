import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { receiptUri } from '../../ingest/receipt/store.js';
import {
  addExternalReceiptReferences,
  createPurchase,
  deletePurchase,
  isReceiptReferenced,
  removeExternalReceiptReferences,
} from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

describe('isReceiptReferenced', () => {
  it('is true for a receipt with a matching purchase_documents row', () => {
    createPurchase(
      opened.db,
      amazonOrder({ documents: [{ documentUri: receiptUri(SHA_A), kind: 'receipt' }] })
    );

    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(true);
  });

  it('is false for a sha nothing was seeded for', () => {
    expect(isReceiptReferenced(opened.db, SHA_B)).toBe(false);
  });

  it('does not let a different receipt row count', () => {
    createPurchase(
      opened.db,
      amazonOrder({ documents: [{ documentUri: receiptUri(SHA_A), kind: 'receipt' }] })
    );

    expect(isReceiptReferenced(opened.db, SHA_B)).toBe(false);
  });
});

describe('external receipt references', () => {
  const OWNER = 'pops://finance/transaction/txn-1';
  const OTHER_OWNER = 'pops://finance/transaction/txn-2';

  const rowCount = (): number =>
    (
      opened.raw.prepare('SELECT COUNT(*) AS n FROM receipt_external_references').get() as {
        n: number;
      }
    ).n;

  it('references a receipt no purchase holds', () => {
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);

    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(true);
    expect(isReceiptReferenced(opened.db, SHA_B)).toBe(false);
  });

  it('stops referencing it once the only reference is removed', () => {
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);

    expect(removeExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)])).toBe(1);

    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(false);
  });

  it('keeps referencing it while one of two owners remains', () => {
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);
    addExternalReceiptReferences(opened.db, OTHER_OWNER, [receiptUri(SHA_A)]);

    removeExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);

    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(true);
  });

  it('survives its purchase being deleted while an external owner remains, and the reverse', () => {
    const purchaseId = createPurchase(
      opened.db,
      amazonOrder({ documents: [{ documentUri: receiptUri(SHA_A), kind: 'receipt' }] })
    );
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);

    removeExternalReceiptReferences(opened.db, OWNER);
    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(true);

    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);
    deletePurchase(opened.db, purchaseId);
    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(true);

    removeExternalReceiptReferences(opened.db, OWNER);
    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(false);
  });

  it('adds one row for a pair sent twice, in one call or two', () => {
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A), receiptUri(SHA_A)]);
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A), receiptUri(SHA_B)]);

    expect(rowCount()).toBe(2);
  });

  it('removes every reference of an owner when no list is given, and only that owner', () => {
    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A), receiptUri(SHA_B)]);
    addExternalReceiptReferences(opened.db, OTHER_OWNER, [receiptUri(SHA_B)]);

    expect(removeExternalReceiptReferences(opened.db, OWNER)).toBe(2);

    expect(isReceiptReferenced(opened.db, SHA_A)).toBe(false);
    expect(isReceiptReferenced(opened.db, SHA_B)).toBe(true);
  });

  it('removes nothing for an empty list, a missing pair, or an empty add', () => {
    addExternalReceiptReferences(opened.db, OWNER, []);
    expect(rowCount()).toBe(0);

    addExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_A)]);

    expect(removeExternalReceiptReferences(opened.db, OWNER, [])).toBe(0);
    expect(removeExternalReceiptReferences(opened.db, OWNER, [receiptUri(SHA_B)])).toBe(0);
    expect(removeExternalReceiptReferences(opened.db, OTHER_OWNER, [receiptUri(SHA_A)])).toBe(0);
    expect(rowCount()).toBe(1);
  });
});
