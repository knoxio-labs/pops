import { describe, expect, it } from 'vitest';

import { readBlocks } from '../blocks.js';

import type { ReceiptPage } from '../blocks.js';

describe('readBlocks', () => {
  it('returns null for every block type absent from the page', () => {
    const page: ReceiptPage = { details: [] };
    expect(readBlocks(page)).toEqual({
      header: null,
      lines: null,
      summary: null,
      payments: null,
      footer: null,
    });
  });

  it('returns null for a block that fails its own schema rather than throwing', () => {
    // `title` is declared as a string; a receipt export that sent a number
    // (the extension's own bug, or a future site change) must not crash the
    // whole import — it reports a missing header, not a thrown exception.
    const page: ReceiptPage = {
      details: [{ __typename: 'ReceiptDetailsHeader', title: 42 }],
    };
    expect(readBlocks(page).header).toBeNull();
  });

  it('falls back to null when the items wrapper is present but malformed', () => {
    const page: ReceiptPage = {
      details: [{ __typename: 'ReceiptDetailsItems', items: 'not-an-array' }],
    };
    expect(readBlocks(page).lines).toBeNull();
  });

  it('reads the items and payments out of their wrapper blocks', () => {
    const page: ReceiptPage = {
      details: [
        { __typename: 'ReceiptDetailsItems', items: [{ description: 'Bread', amount: '3.50' }] },
        {
          __typename: 'ReceiptDetailsPayments',
          payments: [{ description: 'Card', amount: '3.50' }],
        },
      ],
    };
    const blocks = readBlocks(page);
    expect(blocks.lines).toEqual([{ description: 'Bread', amount: '3.50' }]);
    expect(blocks.payments).toEqual([{ description: 'Card', amount: '3.50' }]);
  });
});
