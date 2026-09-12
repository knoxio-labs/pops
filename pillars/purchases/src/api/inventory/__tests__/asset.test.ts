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
import { calendarDateInZone } from '../../../ingest/local-time.js';
import {
  financeTransactionId,
  provenanceNote,
  sourceRefFor,
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
    purchaseDateOffsetMinutes: null,
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

describe('sourceRefFor — the idempotency key (POPS-2433)', () => {
  it('is deterministic: the same offer always computes the same key', () => {
    expect(sourceRefFor(offer())).toBe(sourceRefFor(offer()));
  });

  it('names the order, the line and the slot for a unit with no row yet', () => {
    expect(sourceRefFor(offer({ purchaseId: 'p-1', itemId: 'i-1', unitId: null, slot: 0 }))).toBe(
      'pops://purchases/order/p-1/item/i-1/slot/0'
    );
  });

  it('also names the unit when the offer already has a unit row', () => {
    expect(sourceRefFor(offer({ purchaseId: 'p-1', itemId: 'i-1', unitId: 'u-9' }))).toBe(
      'pops://purchases/order/p-1/item/i-1/unit/u-9'
    );
  });

  it('differs for two different lines on the same order', () => {
    expect(sourceRefFor(offer({ itemId: 'i-1' }))).not.toBe(sourceRefFor(offer({ itemId: 'i-2' })));
  });

  it('differs for two different units on the same line', () => {
    expect(sourceRefFor(offer({ unitId: 'u-1' }))).not.toBe(sourceRefFor(offer({ unitId: 'u-2' })));
  });

  it('differs for two different unnamed slots on the same line (POPS-2433 review finding)', () => {
    // A quantity>1 durable line with no unit rows yet offers one proposal
    // per remaining physical unit, all with unitId: null but a distinct
    // slot. Keying on itemId alone would collide them: accepting the
    // second physical unit would silently return the first's asset.
    expect(sourceRefFor(offer({ unitId: null, slot: 0 }))).not.toBe(
      sourceRefFor(offer({ unitId: null, slot: 1 }))
    );
  });

  it('ignores slot once a unitId names the offer', () => {
    // Once a unit row exists, unitId is the stronger identity and slot is
    // just that same unit's position — no need to double-key on both.
    expect(sourceRefFor(offer({ unitId: 'u-1', slot: 0 }))).toBe(
      sourceRefFor(offer({ unitId: 'u-1', slot: 5 }))
    );
  });

  it('is what toInventoryItemCreateBody sends as sourceRef', () => {
    expect(toInventoryItemCreateBody(offer()).sourceRef).toBe(sourceRefFor(offer()));
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

  it('reads the day at the offset the order was placed at, not the household zone', () => {
    // Bought in Tokyo (+09:00) at 23:30 on the 2nd. Sydney is on +11:00 that
    // week, where the same instant is already 01:30 on the 3rd — so the
    // household zone files this asset a day late.
    const instant = '2026-02-02T14:30:00.000Z';

    expect(calendarDateInZone(instant, 'Australia/Sydney')).toBe('2026-02-03');
    expect(
      toInventoryItemCreateBody(offer({ purchaseDate: instant, purchaseDateOffsetMinutes: 540 }))
        .purchaseDate
    ).toBe('2026-02-02');
  });

  it('does the same for an order placed west of home, not only east of it', () => {
    // Los Angeles (-08:00) at 14:30 on the 2nd; 09:30 on the 3rd in Sydney.
    const instant = '2026-02-02T22:30:00.000Z';

    expect(calendarDateInZone(instant, 'Australia/Sydney')).toBe('2026-02-03');
    expect(
      toInventoryItemCreateBody(offer({ purchaseDate: instant, purchaseDateOffsetMinutes: -480 }))
        .purchaseDate
    ).toBe('2026-02-02');
  });

  it('falls back to the household zone for an order that recorded no offset', () => {
    // Every Amazon-sourced order is this shape: an instant and no place. The
    // household zone is still the best answer available, and losing it would
    // silently re-date all of them in UTC.
    expect(
      toInventoryItemCreateBody(
        offer({ purchaseDate: '2026-02-02T23:41:21.000Z', purchaseDateOffsetMinutes: null })
      ).purchaseDate
    ).toBe('2026-02-03');
  });

  it('sends null rather than the household day when the recorded offset is not one', () => {
    // A stored figure outside ±14:00 is a garbled column, not a place. The
    // household zone is not a safe fallback here: the order DID state where
    // it was placed, and quietly substituting somewhere else would file the
    // asset on a confident wrong day.
    expect(
      toInventoryItemCreateBody(offer({ purchaseDateOffsetMinutes: 900 })).purchaseDate
    ).toBeNull();
  });
});

describe('the fields inventory would otherwise default for us', () => {
  it('states deductible rather than inheriting the other pillar’s default', () => {
    // `false` is a claim purchases can defend: it holds no evidence either
    // way, and stating it means a change to inventory's default cannot
    // silently restamp these assets.
    expect(toInventoryItemCreateBody(offer())).toMatchObject({ deductible: false });
  });

  it('does not send inUse — the fan-out asset is unreviewed, not "not in use" (POPS-2432)', () => {
    // Sending `false` would mean "reviewed, not in use", which is a claim
    // nobody has made about a row nobody has looked at. Inventory's create
    // body can now express "unreviewed" by omitting the field, so this
    // sends nothing rather than restate the old wrong default.
    expect(toInventoryItemCreateBody(offer())).not.toHaveProperty('inUse');
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
