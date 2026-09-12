/**
 * The purchases leg, at the seam between the gateway and the mobile shape.
 *
 * `../../__tests__/mobile-receipt-drafts.test.ts` drives the same code
 * through the real app and the real perimeter. This file holds the half
 * that has nothing to do with HTTP: which of purchases' outcomes maps to
 * which mobile one, what a request bfm sends looks like, and what happens
 * to a response bfm cannot read.
 */
import { describe, expect, it } from 'vitest';

import {
  createPurchasesDraftFake,
  purchasesDraft,
  purchasesDraftUnreadable,
  purchasesPurchaseDetail,
} from '../../__tests__/purchases-draft-fake.js';
import { createPillarGateway, isGatewayOk } from '../../pillars/gateway.js';
import { createMobilePurchasesClient } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MobileReceiptPart } from '../../../contract/rest-schemas.js';
import type { PillarHandleFactory } from '../../pillars/gateway.js';

const PARTS: readonly MobileReceiptPart[] = [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }];

function clientOver(factory: PillarHandleFactory) {
  return createMobilePurchasesClient(createPillarGateway(factory));
}

describe('extractReceipt', () => {
  it('maps a reconciled draft onto the mobile shape, cents throughout', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft({ reconciled: true }));
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.kind).toBe('draft');
    if (outcome.value.kind !== 'draft') return;
    expect(outcome.value.reconciled).toBe(true);
    expect(outcome.value.draft.merchantName).toBe('Bunnings Warehouse');
    expect(outcome.value.draft.totalCents).toBe(2750);
    expect(outcome.value.draft.items).toEqual([
      {
        name: 'Timber Pine DAR 42x19',
        quantity: null,
        unitPriceCents: 1250,
        lineTotalCents: 1250,
        notes: [],
      },
    ]);
  });

  it('carries the gate failures on an unreconciled draft, editable all the same', async () => {
    const fake = createPurchasesDraftFake(
      purchasesDraft({
        reconciled: false,
        failures: [{ kind: 'sum-mismatch', detail: 'off by $2.40', deltaCents: 240 }],
      })
    );
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'draft') return;
    expect(outcome.value.reconciled).toBe(false);
    expect(outcome.value.failures).toEqual([
      { code: 'sum-mismatch', detail: 'off by $2.40', deltaCents: 240 },
    ]);
    // No outcome gates field editability — the items are there either way.
    expect(outcome.value.draft.items).toHaveLength(1);
  });

  it('maps unreadable straight through', async () => {
    const fake = createPurchasesDraftFake(purchasesDraftUnreadable('the model returned nothing'));
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'ok',
      value: {
        kind: 'unreadable',
        receiptUris: ['pops://purchases/receipt/' + 'a'.repeat(64)],
        reason: 'the model returned nothing',
      },
    });
  });

  it('sends the parts unchanged — a re-encode would break the producer’s dedup', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft());
    await clientOver(fake.factory).extractReceipt(PARTS);

    expect(fake.extracted).toEqual([{ parts: PARTS }]);
  });

  it('reports a gateway failure without inventing a draft', async () => {
    const failure: CallResult<unknown> = { kind: 'unavailable', pillar: 'purchases' };
    const fake = createPurchasesDraftFake(failure);
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(isGatewayOk(outcome)).toBe(false);
  });
});

const SAVE_BODY = {
  merchantName: 'Bunnings Warehouse',
  orderedAt: '2026-08-01T14:32:00+10:00',
  currency: 'AUD',
  totalCents: 1250,
  items: [
    {
      name: 'Timber Pine DAR 42x19',
      quantity: null,
      unitPriceCents: 1250,
      lineTotalCents: 1250,
      notes: [],
    },
  ],
  documents: [
    { documentUri: 'pops://purchases/receipt/' + 'a'.repeat(64), kind: 'receipt' as const },
  ],
  idempotencyKey: 'save-1',
};

describe('saveReceiptDraft', () => {
  it('translates the mobile field names to purchases’ own', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft(), purchasesPurchaseDetail());
    await clientOver(fake.factory).saveReceiptDraft(SAVE_BODY);

    expect(fake.saved).toEqual([
      {
        merchantEntityName: 'Bunnings Warehouse',
        orderedAt: SAVE_BODY.orderedAt,
        currency: 'AUD',
        totalCents: 1250,
        taxCents: undefined,
        surchargeCents: undefined,
        shippingCents: undefined,
        discountCents: undefined,
        items: [
          {
            name: 'Timber Pine DAR 42x19',
            quantity: undefined,
            unitPriceCents: 1250,
            lineTotalCents: 1250,
            notes: [],
          },
        ],
        capture: undefined,
        idempotencyKey: 'save-1',
        documents: SAVE_BODY.documents,
      },
    ]);
  });

  it('maps the written purchase onto the mobile detail shape', async () => {
    const fake = createPurchasesDraftFake(
      purchasesDraft(),
      purchasesPurchaseDetail({ id: 'pur-42', source: 'receipt' })
    );
    const outcome = await clientOver(fake.factory).saveReceiptDraft(SAVE_BODY);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.id).toBe('pur-42');
    expect(outcome.value.source).toBe('receipt');
  });

  it('surfaces a producer conflict as a gateway failure, not a fabricated purchase', async () => {
    const conflict: CallResult<unknown> = {
      kind: 'conflict',
      pillar: 'purchases',
      message: 'This receipt has already been saved as purchase pur-1',
    };
    const fake = createPurchasesDraftFake(purchasesDraft(), conflict);
    const outcome = await clientOver(fake.factory).saveReceiptDraft(SAVE_BODY);

    expect(isGatewayOk(outcome)).toBe(false);
  });
});

const MANUAL_BODY = {
  merchantName: SAVE_BODY.merchantName,
  orderedAt: SAVE_BODY.orderedAt,
  currency: SAVE_BODY.currency,
  totalCents: SAVE_BODY.totalCents,
  items: SAVE_BODY.items,
  idempotencyKey: 'manual-1',
};

describe('createManualPurchase', () => {
  it('sends no documents — a manual entry carries no receipt', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft(), purchasesPurchaseDetail());
    await clientOver(fake.factory).createManualPurchase(MANUAL_BODY);

    expect(fake.created).toHaveLength(1);
    expect((fake.created[0] as { documents?: unknown }).documents).toBeUndefined();
  });

  it('maps the written purchase onto the mobile detail shape', async () => {
    const fake = createPurchasesDraftFake(
      purchasesDraft(),
      purchasesPurchaseDetail({ id: 'pur-manual-1', source: 'manual' })
    );
    const outcome = await clientOver(fake.factory).createManualPurchase(MANUAL_BODY);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.id).toBe('pur-manual-1');
    expect(outcome.value.source).toBe('manual');
  });
});
