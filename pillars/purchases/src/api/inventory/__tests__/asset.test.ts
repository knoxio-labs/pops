/**
 * The translation between an offer and inventory's create body.
 *
 * This is where the fan-out can be wrong while every call succeeds: a price
 * off by a hundred, a transaction id taken from a URI that names something
 * else, a serial number quietly dropped. None of those fail anything — they
 * produce an ordinary-looking asset describing something other than what
 * was bought.
 */
import { describe, expect, it } from 'vitest';

import {
  financeTransactionId,
  inventoryItemUri,
  provenanceNote,
  toInventoryItemCreateBody,
} from '../asset.js';

import type { InventoryProposal } from '../../../db/index.js';

function offer(overrides: Partial<InventoryProposal> = {}): InventoryProposal {
  return {
    purchaseId: 'p-1',
    itemId: 'i-1',
    unitId: null,
    slot: 0,
    itemName: 'Cordless Drill',
    serialNumber: null,
    purchaseDate: '2026-02-02T23:41:21.000Z',
    purchasePriceCents: 19900,
    purchasedFromName: 'Bunnings Warehouse',
    purchaseTransactionUri: null,
    kindConfirmed: true,
    ...overrides,
  };
}

describe('the price crosses as dollars', () => {
  it('divides integer cents into the float amount inventory stores', () => {
    expect(toInventoryItemCreateBody(offer()).purchasePrice).toBe(199);
  });

  it('keeps the cents that are not a whole dollar', () => {
    expect(toInventoryItemCreateBody(offer({ purchasePriceCents: 1799 })).purchasePrice).toBe(
      17.99
    );
  });

  it('carries a zero rather than dropping the field', () => {
    // A gift or a fully-discounted line costs nothing and is still an
    // asset; an absent price would read as "unknown", which is a different
    // claim from "free".
    expect(toInventoryItemCreateBody(offer({ purchasePriceCents: 0 })).purchasePrice).toBe(0);
  });
});

describe('the settling transaction crosses as a bare id', () => {
  it('takes the id out of a finance transaction URI', () => {
    expect(financeTransactionId('pops://finance/transaction/t-42')).toBe('t-42');
  });

  it('answers null for a URI addressed to any other pillar', () => {
    // Inventory's column means "a finance transaction". Splitting on the
    // last slash would file a documents id there, and nothing downstream
    // could tell it was the wrong kind of id.
    expect(financeTransactionId('pops://documents/document/7')).toBeNull();
    expect(financeTransactionId('pops://inventory/item/9')).toBeNull();
  });

  it('answers null when the order was not settled by exactly one transaction', () => {
    expect(financeTransactionId(null)).toBeNull();
    expect(toInventoryItemCreateBody(offer()).purchaseTransactionId).toBeNull();
  });
});

describe('the row says where it came from', () => {
  it('names the order and the line', () => {
    expect(provenanceNote(offer())).toContain('p-1');
    expect(provenanceNote(offer())).toContain('i-1');
  });

  it('carries the serial number inventory has no column for', () => {
    expect(provenanceNote(offer({ serialNumber: 'SN-77' }))).toContain('SN-77');
  });

  it('says nothing about a serial number the source never stated', () => {
    expect(provenanceNote(offer())).not.toContain('Serial');
  });
});

describe('the fields that cross unchanged', () => {
  it('sends the purchase instant as purchases holds it', () => {
    // Truncating to a calendar date would move the purchase to the previous
    // day for anything bought after mid-afternoon in Sydney.
    expect(toInventoryItemCreateBody(offer()).purchaseDate).toBe('2026-02-02T23:41:21.000Z');
  });

  it('sends the line name and the merchant label', () => {
    expect(toInventoryItemCreateBody(offer())).toMatchObject({
      itemName: 'Cordless Drill',
      purchasedFromName: 'Bunnings Warehouse',
    });
  });
});

describe('addressing the asset that comes back', () => {
  it('builds the URI the decision column stores', () => {
    expect(inventoryItemUri('abc')).toBe('pops://inventory/item/abc');
  });
});
