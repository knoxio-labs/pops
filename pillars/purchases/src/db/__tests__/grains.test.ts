/**
 * The four grains and the seams between them: order, delivery, line, unit —
 * plus per-item charge attribution, landed cost, and the tag index.
 *
 * The scenarios are the ones that broke the previous single-grain model: a
 * multi-delivery order, a charge that spans two boxes, a quantity-3 line
 * becoming three inventory records, and a 100-line grocery shop.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  getPurchase,
  listItemsByTag,
  purchaseItemAllocations,
  purchaseItems,
  purchaseShipments,
} from '../index.js';
import { amazonOrder, coffeeOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

describe('one order, many deliveries', () => {
  const twoBoxes = () =>
    amazonOrder({
      totalCents: 9000,
      shipments: [
        {
          ref: 'box1',
          sourceShipmentRef: 'SHIP-1',
          carrier: 'AMZL',
          trackingNumber: 'TBA1',
          deliveredAt: '2026-02-04T00:00:00Z',
          status: 'delivered',
          shippingCents: 0,
        },
        {
          ref: 'box2',
          sourceShipmentRef: 'SHIP-2',
          carrier: 'AusPost',
          trackingNumber: 'AP2',
          status: 'shipped',
          shippingCents: 500,
        },
      ],
      items: [
        {
          ref: 'a',
          shipmentRef: 'box1',
          name: 'Item A',
          unitPriceCents: 4000,
          lineTotalCents: 4000,
        },
        {
          ref: 'b',
          shipmentRef: 'box2',
          name: 'Item B',
          unitPriceCents: 4500,
          lineTotalCents: 4500,
        },
        {
          ref: 'c',
          name: 'Digital gift code',
          unitPriceCents: 500,
          lineTotalCents: 500,
          kind: 'digital',
        },
      ],
    });

  it('keeps the order as one row with its deliveries beside it', () => {
    const id = createPurchase(opened.db, twoBoxes());
    const detail = getPurchase(opened.db, id);

    expect(detail?.shipments).toHaveLength(2);
    expect(detail?.items).toHaveLength(3);
    expect(detail?.purchase.sourceOrderId).toBe('249-1512883-0105415');
  });

  it('carries per-delivery carrier, tracking and postage', () => {
    const id = createPurchase(opened.db, twoBoxes());
    const shipments = getPurchase(opened.db, id)?.shipments ?? [];
    const byRef = new Map(shipments.map((s) => [s.sourceShipmentRef, s]));

    expect(byRef.get('SHIP-1')?.carrier).toBe('AMZL');
    expect(byRef.get('SHIP-1')?.deliveredAt).toBe('2026-02-04T00:00:00Z');
    expect(byRef.get('SHIP-2')?.status).toBe('shipped');
    expect(byRef.get('SHIP-2')?.shippingCents).toBe(500);
  });

  it('leaves sourceShipmentRef null when the merchant has no shipment id', () => {
    // Amazon's DSAR export has none, so its adapter supplies only the local
    // wiring `ref`. Promoting that handle into the persisted field would
    // fabricate a merchant identifier that does not exist.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'no-ship-id',
        sourceOrderId: 'no-ship-id',
        shipments: [{ ref: 'box1' }],
      })
    );
    expect(getPurchase(opened.db, id)?.shipments[0]?.sourceShipmentRef).toBeNull();
  });

  it('lets a line belong to no delivery at all', () => {
    const id = createPurchase(opened.db, twoBoxes());
    const digital = getPurchase(opened.db, id)?.items.find((i) => i.item.name.includes('Digital'));
    expect(digital?.item.shipmentId).toBeNull();
  });

  it('orphans lines rather than destroying them when a delivery is removed', () => {
    // The money was still spent. Losing the line because a shipment record
    // went away would silently shrink the order's spend.
    const id = createPurchase(opened.db, twoBoxes());
    const box1 = opened.db
      .select()
      .from(purchaseShipments)
      .all()
      .find((s) => s.sourceShipmentRef === 'SHIP-1');
    opened.raw.prepare('DELETE FROM purchase_shipments WHERE id = ?').run(box1?.id);

    const detail = getPurchase(opened.db, id);
    expect(detail?.items).toHaveLength(3);
    expect(detail?.items.find((i) => i.item.name === 'Item A')?.item.shipmentId).toBeNull();
  });
});

describe('ordering', () => {
  it('reads a receipt back in the order it was printed', () => {
    // Ids are random UUIDs and every line in one ingest shares a createdAt
    // to the second, so without an explicit position this ordering is
    // genuinely non-deterministic — a 100-line grocery receipt would render
    // shuffled, and the reconciliation engine's deterministic candidate
    // ordering (ADR-042) would not hold.
    const names = ['Milk', 'Bread', 'Apples', 'Coffee', 'Rice'];
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5000,
        items: names.map((name) => ({ name, unitPriceCents: 1000, lineTotalCents: 1000 })),
      })
    );

    expect(getPurchase(opened.db, id)?.items.map((i) => i.item.name)).toEqual(names);
  });

  it('is stable across repeated reads', () => {
    const names = Array.from({ length: 30 }, (_, i) => `Item ${String(i)}`);
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 30000,
        items: names.map((name) => ({ name, unitPriceCents: 1000, lineTotalCents: 1000 })),
      })
    );

    const first = getPurchase(opened.db, id)?.items.map((i) => i.item.id);
    for (let i = 0; i < 5; i += 1) {
      expect(getPurchase(opened.db, id)?.items.map((x) => x.item.id)).toEqual(first);
    }
  });

  it('keeps deliveries and charges in their declared order', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 3000,
        shipments: [
          { ref: 'a', sourceShipmentRef: 'first' },
          { ref: 'b', sourceShipmentRef: 'second' },
          { ref: 'c', sourceShipmentRef: 'third' },
        ],
        charges: [
          { sourceChargeRef: 'c1', amountCents: 1000 },
          { sourceChargeRef: 'c2', amountCents: 1000 },
          { sourceChargeRef: 'c3', amountCents: 1000 },
        ],
      })
    );

    const detail = getPurchase(opened.db, id);
    expect(detail?.shipments.map((s) => s.sourceShipmentRef)).toEqual(['first', 'second', 'third']);
    expect(detail?.charges.map((c) => c.charge.sourceChargeRef)).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('per-item charge attribution', () => {
  it('answers which charge paid for which line', () => {
    const id = createPurchase(opened.db, coffeeOrder());
    const detail = getPurchase(opened.db, id);

    const charge = detail?.charges[0];
    const tamper = detail?.items.find((i) => i.item.sku === 'B0DSVZQ8P5');
    const allocation = charge?.allocations.find((a) => a.itemId === tamper?.item.id);

    expect(allocation?.amountCents).toBe(4499);
    expect(charge?.allocations).toHaveLength(2);
  });

  it('splits one charge across lines from two different deliveries', () => {
    // Amazon sometimes charges per product group rather than per box, so a
    // charge is not obliged to line up with a shipment.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 9000,
        shipments: [{ ref: 'box1' }, { ref: 'box2' }],
        items: [
          { ref: 'a', shipmentRef: 'box1', name: 'A', unitPriceCents: 4000, lineTotalCents: 4000 },
          { ref: 'b', shipmentRef: 'box2', name: 'B', unitPriceCents: 5000, lineTotalCents: 5000 },
        ],
        charges: [
          {
            sourceChargeRef: 'chg-1',
            amountCents: 9000,
            allocations: [
              { itemRef: 'a', amountCents: 4000 },
              { itemRef: 'b', amountCents: 5000 },
            ],
          },
        ],
      })
    );

    const detail = getPurchase(opened.db, id);
    const charge = detail?.charges[0];
    // The charge names no shipment, and that is a legitimate answer.
    expect(charge?.charge.shipmentId).toBeNull();
    expect(charge?.allocations).toHaveLength(2);

    const shipmentIdsCovered = new Set(
      charge?.allocations.map(
        (a) => detail?.items.find((i) => i.item.id === a.itemId)?.item.shipmentId
      )
    );
    expect(shipmentIdsCovered.size).toBe(2);
  });

  it('cascades allocations away with their charge', () => {
    const id = createPurchase(opened.db, coffeeOrder());
    const chargeId = getPurchase(opened.db, id)?.charges[0]?.charge.id;
    opened.raw.prepare('DELETE FROM purchase_charges WHERE id = ?').run(chargeId);

    expect(opened.db.select().from(purchaseItemAllocations).all()).toHaveLength(0);
    // Lines survive: what was bought does not depend on how it was paid.
    expect(opened.db.select().from(purchaseItems).all()).toHaveLength(2);
  });
});

describe('units', () => {
  it('gives a quantity-3 line three distinct inventory references', () => {
    // The bug the previous model had: one `inventoryItemUri` on the line
    // cannot express three physical things.
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 15000,
        items: [
          {
            name: 'Nanoleaf bulb',
            quantity: 3,
            unitPriceCents: 5000,
            lineTotalCents: 15000,
            kind: 'durable',
            units: [
              { serialNumber: 'SN-1', inventoryItemUri: 'pops://inventory/item/1' },
              { serialNumber: 'SN-2', inventoryItemUri: 'pops://inventory/item/2' },
              { serialNumber: 'SN-3', inventoryItemUri: 'pops://inventory/item/3' },
            ],
          },
        ],
      })
    );

    const item = getPurchase(opened.db, id)?.items[0];
    expect(item?.item.quantity).toBe(3);
    expect(item?.units).toHaveLength(3);
    expect(new Set(item?.units.map((u) => u.inventoryItemUri)).size).toBe(3);
  });

  it('treats a line with no units as complete, not incomplete', () => {
    const id = createPurchase(opened.db, coffeeOrder());
    expect(getPurchase(opened.db, id)?.items[0]?.units).toEqual([]);
  });
});

describe('landed cost', () => {
  it('adds allocated postage and adjustment to the merchant line total', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        totalCents: 5000,
        items: [
          {
            name: 'Thing',
            unitPriceCents: 4000,
            lineTotalCents: 4000,
            allocatedShippingCents: 800,
            allocatedAdjustmentCents: -200,
          },
        ],
      })
    );

    // 4000 + 800 − 200. This is the figure inventory wants for insurance
    // value, not the 4000 sticker price.
    expect(getPurchase(opened.db, id)?.items[0]?.landedCostCents).toBe(4600);
  });
});

describe('tags', () => {
  it('finds every line carrying a tag across orders', () => {
    createPurchase(opened.db, coffeeOrder());
    createPurchase(
      opened.db,
      amazonOrder({
        checksum: 'second',
        sourceOrderId: '249-0000000-0000000',
        totalCents: 2200,
        items: [{ name: 'Beans', unitPriceCents: 2200, lineTotalCents: 2200, tags: ['coffee'] }],
      })
    );

    expect(listItemsByTag(opened.db, 'coffee')).toHaveLength(3);
    expect(listItemsByTag(opened.db, 'kitchen')).toHaveLength(1);
    expect(listItemsByTag(opened.db, 'nonexistent')).toHaveLength(0);
  });

  it('de-duplicates a tag repeated on one line', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        items: [
          { name: 'Beans', unitPriceCents: 2200, lineTotalCents: 2200, tags: ['coffee', 'coffee'] },
        ],
      })
    );
    expect(getPurchase(opened.db, id)?.items[0]?.tags).toEqual(['coffee']);
  });

  it('handles a grocery-scale shop', () => {
    // ~100 lines is one Woolworths trip, and the point of the tag join
    // table is that this stays a keyed lookup rather than a scan.
    const items = Array.from({ length: 100 }, (_, i) => ({
      name: `Grocery item ${String(i)}`,
      unitPriceCents: 100 + i,
      lineTotalCents: 100 + i,
      kind: 'consumable' as const,
      tags: i % 2 === 0 ? ['groceries', 'fresh'] : ['groceries'],
    }));
    const id = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'woolies', sourceOrderId: 'W-1', totalCents: 14950, items })
    );

    expect(getPurchase(opened.db, id)?.items).toHaveLength(100);
    expect(listItemsByTag(opened.db, 'groceries', 500)).toHaveLength(100);
    expect(listItemsByTag(opened.db, 'fresh', 500)).toHaveLength(50);
  });
});

describe('documents', () => {
  it('attaches evidence to the order and to a specific delivery', () => {
    const id = createPurchase(
      opened.db,
      amazonOrder({
        shipments: [{ ref: 'box1' }],
        documents: [
          { documentUri: 'pops://documents/document/inv-1', kind: 'tax_invoice' },
          {
            documentUri: 'pops://documents/document/photo-1',
            kind: 'delivery_photo',
            shipmentRef: 'box1',
          },
        ],
      })
    );

    const detail = getPurchase(opened.db, id);
    const invoice = detail?.documents.find((d) => d.kind === 'tax_invoice');
    const photo = detail?.documents.find((d) => d.kind === 'delivery_photo');

    expect(invoice?.shipmentId).toBeNull();
    expect(photo?.shipmentId).toBe(detail?.shipments[0]?.id);
  });
});
