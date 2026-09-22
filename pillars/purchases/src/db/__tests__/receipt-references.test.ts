import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { receiptUri } from '../../ingest/receipt/store.js';
import { createPurchase, isReceiptReferenced } from '../index.js';
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
