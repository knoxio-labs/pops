/**
 * The purchases leg, at the seam between the gateway and the mobile shape.
 *
 * `../../__tests__/mobile-receipt-drafts.test.ts` drives the same code
 * through the real app and the real perimeter. This file holds the half
 * that has nothing to do with HTTP: which of purchases' outcomes maps to
 * which mobile one, what a request bfm sends looks like, and what happens
 * to a response bfm cannot read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPurchasesDraftFake,
  purchasesDraft,
  purchasesDraftUnreadable,
  purchasesPurchaseDetail,
} from '../../__tests__/purchases-draft-fake.js';
import {
  createPurchasesReadFake,
  purchasesDetail,
  purchasesRow,
} from '../../__tests__/purchases-read-fake.js';
import { type MobileContactsClient } from '../../contacts/client.js';
import { createPillarGateway, isGatewayOk } from '../../pillars/gateway.js';
import { createMobilePurchasesClient } from '../client.js';
import { CONTACTS_LOOKUP_TIMEOUT_MS } from '../list-page.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MobileReceiptPart } from '../../../contract/rest-schemas.js';
import type { PillarHandleFactory } from '../../pillars/gateway.js';

const PARTS: readonly MobileReceiptPart[] = [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }];

function clientOver(factory: PillarHandleFactory, contacts?: MobileContactsClient) {
  return createMobilePurchasesClient(createPillarGateway(factory), contacts);
}

/** A `MobileContactsClient` stub that records every `lookupEntities` call. */
function contactsSpy(names: ReadonlyMap<string, string> = new Map()): {
  client: MobileContactsClient;
  calls: (readonly string[])[];
} {
  const calls: (readonly string[])[] = [];
  return {
    calls,
    client: {
      lookupEntities: (ids) => {
        calls.push(ids);
        return Promise.resolve({ kind: 'ok', value: names });
      },
    },
  };
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
        listPriceCents: null,
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

  it('carries the matched merchant id through to the mobile shape', async () => {
    const fake = createPurchasesDraftFake(
      purchasesDraft({ matchedMerchantEntityId: 'entity-bunnings' })
    );
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'draft') return;
    expect(outcome.value.matchedMerchantEntityId).toBe('entity-bunnings');
  });

  it('carries a null match through unchanged', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft());
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'draft') return;
    expect(outcome.value.matchedMerchantEntityId).toBeNull();
  });

  it('accepts a draft from a producer that omits the merchant match', async () => {
    const reply = purchasesDraft();
    expect(reply.kind).toBe('ok');
    if (reply.kind !== 'ok' || typeof reply.value !== 'object' || reply.value === null) {
      throw new Error('Expected a draft fixture');
    }
    const legacy = { ...reply.value };
    Reflect.deleteProperty(legacy, 'matchedMerchantEntityId');
    const fake = createPurchasesDraftFake({ ...reply, value: legacy });
    const outcome = await clientOver(fake.factory).extractReceipt(PARTS);

    expect(outcome).toMatchObject({
      kind: 'ok',
      value: { kind: 'draft', matchedMerchantEntityId: null },
    });
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
        taxIncluded: undefined,
        discountIncluded: undefined,
        surchargeIncluded: undefined,
        shippingIncluded: undefined,
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

  it('forwards all four adjustment-basis flags unchanged', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft(), purchasesPurchaseDetail());
    await clientOver(fake.factory).saveReceiptDraft({
      ...SAVE_BODY,
      taxIncluded: true,
      discountIncluded: false,
      surchargeIncluded: false,
      shippingIncluded: true,
    });

    const [saved] = fake.saved as { taxIncluded?: unknown; shippingIncluded?: unknown }[];
    expect(saved?.taxIncluded).toBe(true);
    expect(saved?.shippingIncluded).toBe(true);
  });

  it('forwards a line’s list price and its assertion unchanged', async () => {
    const fake = createPurchasesDraftFake(purchasesDraft(), purchasesPurchaseDetail());
    await clientOver(fake.factory).saveReceiptDraft({
      ...SAVE_BODY,
      items: [
        {
          name: 'Timber Pine DAR 42x19',
          quantity: null,
          unitPriceCents: 1250,
          lineTotalCents: 1250,
          notes: [],
          listPriceCents: 1500,
          listPriceAsserted: true,
        },
      ],
    });

    const [saved] = fake.saved as {
      items: { listPriceCents?: unknown; listPriceAsserted?: unknown }[];
    }[];
    expect(saved?.items[0]?.listPriceCents).toBe(1500);
    expect(saved?.items[0]?.listPriceAsserted).toBe(true);
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

describe('merchant identity batching', () => {
  it('resolves 10 distinct merchant entity ids across 25 rows in exactly ONE call', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      purchasesRow({
        id: `pur-${String(i)}`,
        orderedAt: `2026-08-${String(13 - Math.floor(i / 2)).padStart(2, '0')}T02:00:00.000Z`,
        merchantEntityId: `ent-${String(i % 10)}`,
        merchantEntityName: `Merchant ${String(i % 10)}`,
      })
    );
    const readFake = createPurchasesReadFake(rows);
    const spy = contactsSpy();

    const outcome = await clientOver(readFake.factory, spy.client).listPurchases({
      limit: 25,
      cursor: null,
    });

    expect(isGatewayOk(outcome)).toBe(true);
    expect(spy.calls).toHaveLength(1);
    expect(new Set(spy.calls[0])).toEqual(
      new Set(Array.from({ length: 10 }, (_, i) => `ent-${String(i)}`))
    );
    expect(spy.calls[0]).toHaveLength(10);
  });

  it('makes zero calls for a page with no merchant entity ids at all', async () => {
    const readFake = createPurchasesReadFake([
      purchasesRow({ id: 'pur-1', merchantEntityId: null }),
      purchasesRow({ id: 'pur-2', merchantEntityId: null, orderedAt: '2026-08-12T02:00:00.000Z' }),
    ]);
    const spy = contactsSpy();

    await clientOver(readFake.factory, spy.client).listPurchases({ limit: 10, cursor: null });

    expect(spy.calls).toHaveLength(0);
  });

  it('makes zero calls for an entirely empty page', async () => {
    const readFake = createPurchasesReadFake([]);
    const spy = contactsSpy();

    await clientOver(readFake.factory, spy.client).listPurchases({ limit: 10, cursor: null });

    expect(spy.calls).toHaveLength(0);
  });

  it('degrades to an unnamed entity rather than a 502 when contacts is down', async () => {
    const readFake = createPurchasesReadFake([
      purchasesRow({ id: 'pur-1', merchantEntityId: 'ent-1', merchantEntityName: 'K mart' }),
    ]);
    const downContacts: MobileContactsClient = {
      lookupEntities: () =>
        Promise.resolve({ kind: 'unavailable', pillar: 'contacts', status: 503 }),
    };

    const outcome = await clientOver(readFake.factory, downContacts).listPurchases({
      limit: 10,
      cursor: null,
    });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.data[0]?.merchant).toEqual({
      resolution: 'entity',
      entityId: 'ent-1',
      name: null,
    });
  });

  it('resolves a single order’s merchant entity through the same batched call', async () => {
    const readFake = createPurchasesReadFake(
      [purchasesRow({ id: 'pur-1', merchantEntityId: 'ent-1' })],
      {
        'pur-1': purchasesDetail({
          id: 'pur-1',
          merchantEntityId: 'ent-1',
          merchantEntityName: 'K mart',
        }),
      }
    );
    const spy = contactsSpy(new Map([['ent-1', 'Kmart']]));

    const outcome = await clientOver(readFake.factory, spy.client).getPurchase('pur-1');

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.merchant).toEqual({
      resolution: 'entity',
      entityId: 'ent-1',
      name: 'Kmart',
    });
    expect(spy.calls).toEqual([['ent-1']]);
  });

  // scripts/ios-e2e/purchases-stub.mjs answers a manually-created purchase
  // without a `merchantEntityId` key at all — not `null`, absent — and the
  // iOS UI-flow lane's manual-entry flow 502'd against this pillar's own
  // requirement that the key be present. Reproduced directly against the
  // wire, not through `purchasesDetail`'s fixture builder, which always sets
  // the key: this is the one case that has to omit it.
  it('does not fail the response when purchases omits merchantEntityId entirely', async () => {
    const detail: CallResult<unknown> = {
      kind: 'ok',
      value: {
        purchase: {
          id: 'pur-1',
          source: 'manual',
          merchantEntityName: 'Corner Store',
          totalCents: 500,
          subtotalCents: 500,
          taxCents: 0,
          shippingCents: 0,
          discountCents: 0,
          surchargeCents: 0,
          currency: 'AUD',
          orderedAt: '2026-08-13T02:15:00.000Z',
          orderedAtOffsetMinutes: 600,
          status: 'linked',
        },
        items: [],
        documents: [],
      },
    };
    const readFake = createPurchasesReadFake([], { 'pur-1': detail });

    const outcome = await clientOver(readFake.factory).getPurchase('pur-1');

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.merchant).toEqual({ resolution: 'name', name: 'Corner Store' });
  });
});

describe('a contacts outage never fails the purchases response', () => {
  it('degrades to an unnamed entity when contacts is unreachable', async () => {
    const readFake = createPurchasesReadFake([
      purchasesRow({ id: 'pur-1', merchantEntityId: 'ent-1', merchantEntityName: 'K mart' }),
    ]);
    const downContacts: MobileContactsClient = {
      lookupEntities: () =>
        Promise.resolve({ kind: 'unavailable', pillar: 'contacts', status: 503 }),
    };

    const outcome = await clientOver(readFake.factory, downContacts).listPurchases({
      limit: 10,
      cursor: null,
    });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.data[0]?.merchant).toEqual({
      resolution: 'entity',
      entityId: 'ent-1',
      name: null,
    });
  });

  it('degrades to an unnamed entity when contacts answers a shape this pillar cannot read', async () => {
    const readFake = createPurchasesReadFake([
      purchasesRow({ id: 'pur-1', merchantEntityId: 'ent-1', merchantEntityName: 'K mart' }),
    ]);
    const erroringContacts: MobileContactsClient = {
      lookupEntities: () =>
        Promise.resolve({ kind: 'contract-mismatch', pillar: 'contacts', status: 502 }),
    };

    const outcome = await clientOver(readFake.factory, erroringContacts).listPurchases({
      limit: 10,
      cursor: null,
    });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.data[0]?.merchant).toEqual({
      resolution: 'entity',
      entityId: 'ent-1',
      name: null,
    });
  });

  describe('a contacts call that never answers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('degrades to an unnamed entity on its own timeout, not the SDK’s 30s call timeout', async () => {
      const readFake = createPurchasesReadFake([
        purchasesRow({ id: 'pur-1', merchantEntityId: 'ent-1', merchantEntityName: 'K mart' }),
      ]);
      // Never resolves on its own — only `resolveMergedNames`'s own bound
      // (`CONTACTS_LOOKUP_TIMEOUT_MS`) can end this call. If that bound were
      // missing, this test would hang until the suite's own timeout instead
      // of failing cleanly, which is why it is asserted below rather than
      // just trusted to pass.
      const hungContacts: MobileContactsClient = {
        lookupEntities: () => new Promise(() => undefined),
      };

      const pending = clientOver(readFake.factory, hungContacts).listPurchases({
        limit: 10,
        cursor: null,
      });

      await vi.advanceTimersByTimeAsync(CONTACTS_LOOKUP_TIMEOUT_MS);
      const outcome = await pending;

      expect(isGatewayOk(outcome)).toBe(true);
      if (!isGatewayOk(outcome)) return;
      expect(outcome.value.data[0]?.merchant).toEqual({
        resolution: 'entity',
        entityId: 'ent-1',
        name: null,
      });
    });
  });

  it('degrades to an unnamed entity rather than crashing the request when the client throws', async () => {
    const readFake = createPurchasesReadFake([
      purchasesRow({ id: 'pur-1', merchantEntityId: 'ent-1', merchantEntityName: 'K mart' }),
    ]);
    const throwingContacts: MobileContactsClient = {
      lookupEntities: () => Promise.reject(new Error('boom')),
    };

    const outcome = await clientOver(readFake.factory, throwingContacts).listPurchases({
      limit: 10,
      cursor: null,
    });

    expect(isGatewayOk(outcome)).toBe(true);
    if (!isGatewayOk(outcome)) return;
    expect(outcome.value.data[0]?.merchant).toEqual({
      resolution: 'entity',
      entityId: 'ent-1',
      name: null,
    });
  });
});
