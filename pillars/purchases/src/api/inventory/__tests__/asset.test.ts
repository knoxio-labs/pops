/**
 * The translation between an offer and inventory's create body.
 *
 * This is where the fan-out can be wrong while every call succeeds: a price
 * off by a hundred, a transaction id taken from a URI that names something
 * else, a serial number quietly dropped. None of those fail anything — they
 * produce an ordinary-looking asset describing something other than what
 * was bought.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inventoryItemUri } from '../../../contract/inventory-proposals.js';
import { financeTransactionId, provenanceNote, toInventoryItemCreateBody } from '../asset.js';

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

const previousZone = process.env['PURCHASES_TIME_ZONE'];

beforeEach(() => {
  // Pinned rather than inherited: the day a purchase falls on is the thing
  // under test, and a runner with its own zone set would assert nothing.
  process.env['PURCHASES_TIME_ZONE'] = 'Australia/Sydney';
});

afterEach(() => {
  if (previousZone === undefined) delete process.env['PURCHASES_TIME_ZONE'];
  else process.env['PURCHASES_TIME_ZONE'] = previousZone;
});

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

describe('the purchase date crosses as a calendar day', () => {
  it('truncates the instant, because the column is a date input on the other side', () => {
    // An instant blanks inventory's `<input type="date">`, which then writes
    // null back on the next save of any field on the row — the fan-out
    // deleting the one fact it exists to carry.
    expect(toInventoryItemCreateBody(offer()).purchaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it('reads the day where the shops are, not in UTC', () => {
    // 23:41 UTC on the 2nd is already the morning of the 3rd in Sydney.
    // Truncating in UTC would file the purchase on the wrong day for
    // everything bought after mid-afternoon.
    expect(toInventoryItemCreateBody(offer()).purchaseDate).toBe('2026-02-03');
  });

  it('keeps the day for a purchase that does not cross midnight either way', () => {
    expect(
      toInventoryItemCreateBody(offer({ purchaseDate: '2026-02-02T01:41:21.000Z' })).purchaseDate
    ).toBe('2026-02-02');
  });

  it('sends null rather than a guess when the stored value is not an instant', () => {
    expect(
      toInventoryItemCreateBody(offer({ purchaseDate: 'not-a-date' })).purchaseDate
    ).toBeNull();
  });
});

describe('the fields inventory would otherwise default for us', () => {
  it('states the review flags rather than inheriting the other pillar’s defaults', () => {
    // `false` is not "unreviewed" — inventory's create body cannot say that
    // — but it is the value purchases can defend, and stating it means a
    // change to inventory's default cannot silently restamp these assets.
    expect(toInventoryItemCreateBody(offer())).toMatchObject({
      inUse: false,
      deductible: false,
    });
  });
});

describe('the fields that cross unchanged', () => {
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
