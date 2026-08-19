/**
 * Proposing inventory assets from durable lines, and answering a proposal.
 *
 * The cases are chosen against the ways a fan-out can look right and be
 * useless. A pass that only ever checks "a durable line produces an offer"
 * is green for an implementation that offers the same cable every night,
 * offers a line that was cancelled before it shipped, or offers three
 * assets for a quantity-3 line whose prices do not add up to what was paid.
 * Each of those is a separate case below, because each is a separate way
 * the prompt stops being trusted.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  confirmItemClassification,
  createPurchase,
  decideInventoryProposal,
  getPurchase,
  InventoryProposalConflictError,
  listDistinctInventoryItemUris,
  listInventoryProposals,
  markInventoryItemUriStale,
} from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { CreateItemInput, CreatePurchaseInput, OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

const INVENTORY_URI = 'pops://inventory/item/i-1';

const DURABLE_LINE: CreateItemInput = {
  ref: 'drill',
  name: 'Cordless Drill',
  unitPriceCents: 19900,
  lineTotalCents: 19900,
  kind: 'durable',
};

function seed(overrides: Partial<CreatePurchaseInput> = {}): string {
  return createPurchase(
    opened.db,
    amazonOrder({
      merchantEntityName: 'Bunnings Warehouse',
      items: [DURABLE_LINE],
      ...overrides,
    })
  );
}

function itemIdOf(purchaseId: string, index = 0): string {
  const id = getPurchase(opened.db, purchaseId)?.items[index]?.item.id;
  if (id === undefined) throw new Error(`the seeded order has no line at index ${index}`);
  return id;
}

function unitsOf(purchaseId: string, index = 0) {
  return getPurchase(opened.db, purchaseId)?.items[index]?.units ?? [];
}

describe('what makes a proposal', () => {
  it('offers a durable line, populated from the order', () => {
    const purchaseId = seed();

    const [proposal, ...rest] = listInventoryProposals(opened.db, purchaseId);

    expect(rest).toEqual([]);
    expect(proposal).toMatchObject({
      purchaseId,
      itemId: itemIdOf(purchaseId),
      unitId: null,
      slot: 0,
      itemName: 'Cordless Drill',
      serialNumber: null,
      purchaseDate: '2026-02-02T01:41:21Z',
      purchasePriceCents: 19900,
      purchasedFromName: 'Bunnings Warehouse',
      purchaseTransactionUri: null,
    });
  });

  it('offers nothing for a line that is not durable', () => {
    const purchaseId = seed({
      items: [{ ...DURABLE_LINE, kind: 'consumable' }],
    });

    expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
  });

  it('offers nothing for a line nothing has classified', () => {
    const purchaseId = seed({ items: [{ ...DURABLE_LINE, kind: undefined }] });

    expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
  });

  it('says whether the durable classification was asserted or merely proposed', () => {
    const purchaseId = seed({ items: [{ ...DURABLE_LINE, kind: undefined }] });
    const itemId = itemIdOf(purchaseId);
    // Straight to the column, which is what a classification pass writes:
    // the only confirming path is `confirmItemClassification`, so there is
    // no other way to reach the proposed-but-unconfirmed state.
    opened.raw.prepare('UPDATE purchase_items SET kind = ? WHERE id = ?').run('durable', itemId);

    expect(listInventoryProposals(opened.db, purchaseId)[0]?.kindConfirmed).toBe(false);

    confirmItemClassification(opened.db, purchaseId, itemId, { kind: 'durable' });

    expect(listInventoryProposals(opened.db, purchaseId)[0]?.kindConfirmed).toBe(true);
  });

  it('offers nothing for a line on a delivery that never arrived', () => {
    for (const status of ['cancelled', 'returned'] as const) {
      const purchaseId = seed({
        checksum: `amazon:${status}`,
        sourceOrderId: `order-${status}`,
        shipments: [{ ref: 'box', status }],
        items: [{ ...DURABLE_LINE, shipmentRef: 'box' }],
      });

      expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
    }
  });

  it('offers a line on a delivered shipment', () => {
    const purchaseId = seed({
      shipments: [{ ref: 'box', status: 'delivered' }],
      items: [{ ...DURABLE_LINE, shipmentRef: 'box' }],
    });

    expect(listInventoryProposals(opened.db, purchaseId)).toHaveLength(1);
  });

  it('offers nothing for a line that went back, but still offers a discounted one', () => {
    const purchaseId = seed();
    const itemId = itemIdOf(purchaseId);
    const setRefund = opened.raw.prepare(
      'UPDATE purchase_items SET refunded_cents = ? WHERE id = ?'
    );

    setRefund.run(500, itemId);
    expect(listInventoryProposals(opened.db, purchaseId)).toHaveLength(1);

    setRefund.run(19900, itemId);
    expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
  });

  it('answers nothing for an order that does not exist', () => {
    expect(listInventoryProposals(opened.db, 'no-such-order')).toEqual([]);
  });
});

describe('one proposal per physical thing', () => {
  it('offers a quantity-3 line three times, splitting its landed cost exactly', () => {
    const purchaseId = seed({
      items: [
        {
          ...DURABLE_LINE,
          quantity: 3,
          unitPriceCents: 334,
          lineTotalCents: 1000,
        },
      ],
    });

    const proposals = listInventoryProposals(opened.db, purchaseId);

    expect(proposals.map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(proposals.map((p) => p.purchasePriceCents)).toEqual([334, 333, 333]);
    expect(proposals.reduce((sum, p) => sum + p.purchasePriceCents, 0)).toBe(1000);
  });

  it('prices a unit at its share of landed cost, not of the sticker price', () => {
    const purchaseId = seed({
      shippingCents: 1000,
      items: [
        {
          ...DURABLE_LINE,
          quantity: 2,
          lineTotalCents: 1000,
          allocatedShippingCents: 1000,
          allocatedAdjustmentCents: -200,
        },
      ],
    });

    expect(listInventoryProposals(opened.db, purchaseId).map((p) => p.purchasePriceCents)).toEqual([
      900, 900,
    ]);
  });

  it('carries the serial number of a unit the source already identified', () => {
    const purchaseId = seed({
      items: [{ ...DURABLE_LINE, quantity: 2, units: [{ serialNumber: 'SN-7' }] }],
    });

    const proposals = listInventoryProposals(opened.db, purchaseId);

    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toMatchObject({
      unitId: unitsOf(purchaseId)[0]?.id,
      serialNumber: 'SN-7',
    });
    expect(proposals[1]).toMatchObject({ unitId: null, serialNumber: null });
  });
});

describe('what stops a line proposing twice', () => {
  it('does not offer a unit that is already in inventory', () => {
    const purchaseId = seed({
      items: [{ ...DURABLE_LINE, quantity: 2, units: [{ inventoryItemUri: INVENTORY_URI }] }],
    });

    const proposals = listInventoryProposals(opened.db, purchaseId);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.unitId).toBeNull();
  });

  it('does not offer a unit that was declined', () => {
    const purchaseId = seed();

    decideInventoryProposal(opened.db, purchaseId, itemIdOf(purchaseId), { decision: 'declined' });

    expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
  });

  it('does not re-offer a link the nightly cron found unresolvable', () => {
    const purchaseId = seed();

    decideInventoryProposal(opened.db, purchaseId, itemIdOf(purchaseId), {
      decision: 'accepted',
      inventoryItemUri: INVENTORY_URI,
    });
    markInventoryItemUriStale(opened.db, INVENTORY_URI, '2026-03-01T00:00:00.000Z');

    expect(unitsOf(purchaseId)[0]?.inventoryItemStaleAt).toBe('2026-03-01T00:00:00.000Z');
    expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
  });

  it('refuses to answer more proposals than the line has units', () => {
    const purchaseId = seed();
    const itemId = itemIdOf(purchaseId);

    decideInventoryProposal(opened.db, purchaseId, itemId, { decision: 'declined' });

    expect(() =>
      decideInventoryProposal(opened.db, purchaseId, itemId, { decision: 'declined' })
    ).toThrow(InventoryProposalConflictError);
    expect(unitsOf(purchaseId)).toHaveLength(1);
  });

  it('refuses to answer a unit that has already been answered', () => {
    const purchaseId = seed({ items: [{ ...DURABLE_LINE, quantity: 2 }] });
    const itemId = itemIdOf(purchaseId);
    const unit = decideInventoryProposal(opened.db, purchaseId, itemId, { decision: 'declined' });

    expect(() =>
      decideInventoryProposal(opened.db, purchaseId, itemId, {
        decision: 'accepted',
        inventoryItemUri: INVENTORY_URI,
        unitId: unit?.id,
      })
    ).toThrow(InventoryProposalConflictError);
  });

  it('will not let a unit be both in inventory and declined', () => {
    const purchaseId = seed();

    decideInventoryProposal(opened.db, purchaseId, itemIdOf(purchaseId), {
      decision: 'accepted',
      inventoryItemUri: INVENTORY_URI,
    });

    expect(() =>
      opened.raw
        .prepare('UPDATE purchase_item_units SET inventory_declined_at = ? WHERE item_id = ?')
        .run('2026-03-01T00:00:00.000Z', itemIdOf(purchaseId))
    ).toThrow(/CHECK constraint failed/u);
  });
});

describe('answering a proposal', () => {
  it('hands an accepted unit to the nightly cron work set', () => {
    const purchaseId = seed();

    const unit = decideInventoryProposal(opened.db, purchaseId, itemIdOf(purchaseId), {
      decision: 'accepted',
      inventoryItemUri: INVENTORY_URI,
    });

    expect(unit?.inventoryItemUri).toBe(INVENTORY_URI);
    expect(unit?.inventoryDeclinedAt).toBeNull();
    expect(listDistinctInventoryItemUris(opened.db)).toEqual([INVENTORY_URI]);
    expect(listInventoryProposals(opened.db, purchaseId)).toEqual([]);
  });

  it('answers on the oldest undecided unit when the caller names none', () => {
    const purchaseId = seed({
      items: [{ ...DURABLE_LINE, quantity: 2, units: [{ serialNumber: 'SN-7' }] }],
    });

    const unit = decideInventoryProposal(opened.db, purchaseId, itemIdOf(purchaseId), {
      decision: 'accepted',
      inventoryItemUri: INVENTORY_URI,
    });

    expect(unit?.serialNumber).toBe('SN-7');
    expect(unitsOf(purchaseId)).toHaveLength(1);
  });

  it('will not answer a line through the wrong order', () => {
    const mine = seed();
    const other = seed({ checksum: 'amazon:other', sourceOrderId: 'other' });

    expect(
      decideInventoryProposal(opened.db, other, itemIdOf(mine), { decision: 'declined' })
    ).toBeUndefined();
    expect(unitsOf(mine)).toEqual([]);
  });

  it('will not answer a unit the line does not have', () => {
    const purchaseId = seed();

    expect(
      decideInventoryProposal(opened.db, purchaseId, itemIdOf(purchaseId), {
        decision: 'declined',
        unitId: 'no-such-unit',
      })
    ).toBeUndefined();
  });
});

describe('naming the transaction that paid for it', () => {
  function linkTransaction(chargeId: string, uri: string, confirmed: boolean): void {
    opened.raw
      .prepare(
        'INSERT INTO purchase_charge_links (id, charge_id, transaction_uri, amount_cents, link_type, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        crypto.randomUUID(),
        chargeId,
        uri,
        19900,
        'exact',
        confirmed ? '2026-02-03T00:00:00Z' : null
      );
  }

  function seedWithCharges(count: number): { purchaseId: string; chargeIds: string[] } {
    const purchaseId = seed({
      charges: Array.from({ length: count }, (_unused, index) => ({
        sourceChargeRef: `chg-${index}`,
        amountCents: 19900,
        chargedAt: '2026-02-02T12:00:00Z',
      })),
    });
    const chargeIds = getPurchase(opened.db, purchaseId)?.charges.map((c) => c.charge.id) ?? [];
    return { purchaseId, chargeIds };
  }

  function uriOf(purchaseId: string): string | null | undefined {
    return listInventoryProposals(opened.db, purchaseId)[0]?.purchaseTransactionUri;
  }

  it('names the one transaction a human confirmed', () => {
    const { purchaseId, chargeIds } = seedWithCharges(1);

    linkTransaction(chargeIds[0] ?? '', 'pops://finance/transaction/t1', true);

    expect(uriOf(purchaseId)).toBe('pops://finance/transaction/t1');
  });

  it('names nothing for a link the matcher merely proposed', () => {
    const { purchaseId, chargeIds } = seedWithCharges(1);

    linkTransaction(chargeIds[0] ?? '', 'pops://finance/transaction/t1', false);

    expect(uriOf(purchaseId)).toBeNull();
  });

  it('names nothing when the order settled across two transactions', () => {
    const { purchaseId, chargeIds } = seedWithCharges(2);

    linkTransaction(chargeIds[0] ?? '', 'pops://finance/transaction/t1', true);
    linkTransaction(chargeIds[1] ?? '', 'pops://finance/transaction/t2', true);

    expect(uriOf(purchaseId)).toBeNull();
  });
});
