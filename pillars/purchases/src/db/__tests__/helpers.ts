import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openPurchasesDb, upsertSource, type OpenedPurchasesDb } from '../index.js';

import type { CreatePurchaseInput } from '../index.js';

/**
 * Open a throwaway on-disk purchases DB with migrations applied.
 *
 * On disk rather than `:memory:` on purpose — the migration journal, the
 * WAL pragma and `foreign_keys=ON` are what these tests are checking, and
 * an in-memory handle exercises a different code path in the opener.
 */
export function openTempDb(): { opened: OpenedPurchasesDb; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'purchases-test-'));
  const opened = openPurchasesDb(join(dir, 'purchases.db'));
  return {
    opened,
    cleanup: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function seedAmazonSource(opened: OpenedPurchasesDb): void {
  upsertSource(opened.db, {
    id: 'amazon',
    label: 'Amazon',
    descriptorPattern: 'AMAZON%',
    settlementWindowDays: 21,
    autoLinkPolicy: 'review',
    ingestAdapter: 'amazon-export',
  });
}

/** A minimal valid order. Override any field per test. */
export function amazonOrder(overrides: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput {
  return {
    source: 'amazon',
    sourceOrderId: '249-1512883-0105415',
    ingestMethod: 'export',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    checksum: 'amazon:249-1512883-0105415',
    ...overrides,
  };
}

/**
 * The real two-line coffee order from the Amazon DSAR export, shipped in
 * one box and settled by one charge. Used wherever a test needs a
 * fully-formed order rather than a bare total.
 */
export function coffeeOrder(overrides: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput {
  return amazonOrder({
    totalCents: 5678,
    shipments: [{ ref: 'box1', carrier: 'AMZL', status: 'delivered', shippingCents: 0 }],
    items: [
      {
        ref: 'tamper',
        shipmentRef: 'box1',
        name: 'Espresso Tamping Station',
        sku: 'B0DSVZQ8P5',
        unitPriceCents: 4499,
        lineTotalCents: 4499,
        kind: 'durable',
        tags: ['coffee', 'kitchen'],
      },
      {
        ref: 'funnel',
        shipmentRef: 'box1',
        name: 'Magnetic Dosing Funnel',
        sku: 'B0FCSJTKJ8',
        unitPriceCents: 1179,
        lineTotalCents: 1179,
        kind: 'durable',
        tags: ['coffee'],
      },
    ],
    charges: [
      {
        sourceChargeRef: 'chg-1',
        shipmentRef: 'box1',
        amountCents: 5678,
        chargedAt: '2026-02-02T12:23:50Z',
        paymentHint: 'Visa - 7373',
        allocations: [
          { itemRef: 'tamper', amountCents: 4499 },
          { itemRef: 'funnel', amountCents: 1179 },
        ],
      },
    ],
    ...overrides,
  });
}
