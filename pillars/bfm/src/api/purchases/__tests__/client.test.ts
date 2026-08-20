/**
 * The purchases leg, at the seam between the gateway and the mobile shape.
 *
 * `../../__tests__/mobile-receipts.test.ts` drives the same code through the
 * real app and the real perimeter. This file holds the half that has nothing
 * to do with HTTP: which of purchases' outcomes maps to which mobile one, what
 * happens to a response bfm cannot read, and the fact that the parts reach the
 * producer exactly as the handset sent them.
 *
 * The last one is the assertion with the quietest failure. A re-encode here
 * would still produce a purchase — a second one, every time a phone retried a
 * timed-out upload, because the producer's dedup is over the bytes.
 */
import { describe, expect, it } from 'vitest';

import {
  createPurchasesFake,
  purchasesCreated,
  purchasesNeedsReview,
  purchasesUnreadable,
} from '../../__tests__/purchases-fake.js';
import { createPillarGateway, isGatewayOk } from '../../pillars/gateway.js';
import { createMobilePurchasesClient } from '../client.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MobileReceiptPart } from '../../../contract/rest-schemas.js';
import type { PillarHandleFactory } from '../../pillars/gateway.js';

const PARTS: readonly MobileReceiptPart[] = [
  { mediaType: 'image/jpeg', dataBase64: 'AAAA' },
  { mediaType: 'image/png', dataBase64: 'BBBB' },
];

function clientOver(factory: PillarHandleFactory) {
  return createMobilePurchasesClient(createPillarGateway(factory));
}

function clientAnswering(result: CallResult<unknown>) {
  const fake = createPurchasesFake(result);
  return { client: clientOver(fake.factory), fake };
}

describe('a receipt purchases created', () => {
  it('maps the purchase onto the fields a confirmation screen draws', async () => {
    const { client } = clientAnswering(
      purchasesCreated({
        id: 'pur-9',
        merchantEntityName: 'Coles',
        totalCents: 1234,
        currency: 'AUD',
        orderedAt: '2026-08-12T22:00:00.000Z',
        itemCount: 5,
      })
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'ok',
      value: {
        kind: 'created',
        alreadyStored: false,
        purchase: {
          id: 'pur-9',
          merchantName: 'Coles',
          totalCents: 1234,
          currency: 'AUD',
          orderedAt: '2026-08-12T22:00:00.000Z',
          itemCount: 5,
        },
      },
    });
  });

  it('keeps the money in the producer’s cents, unconverted', async () => {
    const { client } = clientAnswering(purchasesCreated({ totalCents: 999 }));

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'created').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'created') return;
    expect(outcome.value.purchase.totalCents).toBe(999);
  });

  it('carries alreadyStored through, so a retry is not drawn as a second purchase', async () => {
    const { client } = clientAnswering(purchasesCreated({ alreadyStored: true }));

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'created').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'created') return;
    expect(outcome.value.alreadyStored).toBe(true);
  });

  it('passes a null merchant through rather than inventing a label', async () => {
    const { client } = clientAnswering(purchasesCreated({ merchantEntityName: null }));

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'created').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'created') return;
    expect(outcome.value.purchase.merchantName).toBeNull();
  });
});

describe('the other two outcomes', () => {
  it('publishes the gate’s objections and the reading they are about', async () => {
    const { client } = clientAnswering(
      purchasesNeedsReview([
        {
          kind: 'sum-mismatch',
          detail: 'lines fall 240c short of the stated total',
          deltaCents: -240,
        },
        { kind: 'unreadable-line', detail: 'line 7 is illegible' },
      ])
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'ok',
      value: {
        kind: 'needs-review',
        receiptCount: 1,
        problems: [
          {
            code: 'sum-mismatch',
            detail: 'lines fall 240c short of the stated total',
            deltaCents: -240,
          },
          { code: 'unreadable-line', detail: 'line 7 is illegible', deltaCents: null },
        ],
        extracted: {
          merchantName: 'Woolworths',
          address: '12 Example St',
          purchasedOn: '2026-08-13',
          purchasedAt: '14:05',
          currency: 'AUD',
          total: '$84.20',
          tax: '$7.65',
          discounts: ['$2.00'],
          surcharges: ['$0.50'],
          shipping: null,
          lines: [{ description: 'MILK 2L', amount: '$3.10', quantity: 2, unitNote: '2 @ $1.55' }],
          unreadableNotes: ['line 7 is smudged'],
        },
      },
    });
  });

  it('drops the producer’s inferred timeZone, which no screen has a label for', async () => {
    const { client } = clientAnswering(
      purchasesNeedsReview([{ kind: 'no-lines', detail: 'none' }])
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'needs-review').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'needs-review') return;
    expect(Object.keys(outcome.value.extracted)).not.toContain('timeZone');
  });

  it('turns the producer’s omitted defaults into explicit absences', async () => {
    // `purchases` defaults address, shipping, discounts, surcharges and the
    // unreadable notes rather than requiring them, so a model that omitted one
    // produced a perfectly good reading. The phone gets one shape to decode.
    const { client } = clientAnswering(
      purchasesNeedsReview([{ kind: 'no-lines', detail: 'nothing legible' }], {
        extracted: {
          merchantName: null,
          purchasedOn: null,
          purchasedAt: null,
          currency: null,
          total: '$0.00',
          tax: null,
          lines: [{ description: 'ONE THING', amount: '$1.00' }],
        },
      })
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'needs-review').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'needs-review') return;
    expect(outcome.value.extracted).toEqual({
      merchantName: null,
      address: null,
      purchasedOn: null,
      purchasedAt: null,
      currency: null,
      total: '$0.00',
      tax: null,
      discounts: [],
      surcharges: [],
      shipping: null,
      lines: [{ description: 'ONE THING', amount: '$1.00', quantity: null, unitNote: null }],
      unreadableNotes: [],
    });
  });

  it('counts the stored parts rather than publishing pointers the phone cannot follow', async () => {
    const { client } = clientAnswering(
      purchasesNeedsReview([{ kind: 'no-lines', detail: 'none' }], {
        receiptUris: ['pops://purchases/receipt/a', 'pops://purchases/receipt/b'],
      })
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'needs-review').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'needs-review') return;
    expect(outcome.value.receiptCount).toBe(2);
    expect(JSON.stringify(outcome.value)).not.toContain('pops://');
  });

  it('accepts a failure kind this build has never heard of', async () => {
    // The producer's gate is allowed to grow a reason. If that made the parse
    // fail, a working purchases would reach the phone as "answered with a
    // contract this pillar cannot call", which is a false statement.
    const { client } = clientAnswering(
      purchasesNeedsReview([{ kind: 'a-reason-invented-later', detail: 'whatever it is' }])
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome) && outcome.value.kind === 'needs-review').toBe(true);
    if (!isGatewayOk(outcome) || outcome.value.kind !== 'needs-review') return;
    expect(outcome.value.problems).toEqual([
      { code: 'a-reason-invented-later', detail: 'whatever it is', deltaCents: null },
    ]);
  });

  it('refuses a needs-review the producer sent no reading with', async () => {
    // The whole point of the arm. An outcome saying "these numbers disagree"
    // with nothing to compare against is a screen that cannot be acted on, and
    // that is a contract fault rather than something to render half of.
    const { client } = clientAnswering({
      kind: 'ok',
      value: {
        kind: 'needs-review',
        receiptUris: ['pops://purchases/receipt/abc'],
        failures: [{ kind: 'no-lines', detail: 'none' }],
      },
    });

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome.kind).toBe('contract-mismatch');
  });

  it('carries the unreadable reason through unchanged', async () => {
    const { client } = clientAnswering(purchasesUnreadable('no text was found in the image'));

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'ok',
      value: { kind: 'unreadable', receiptCount: 1, reason: 'no text was found in the image' },
    });
  });
});

describe('what reaches the producer', () => {
  it('sends the parts verbatim, in order', async () => {
    const { client, fake } = clientAnswering(purchasesCreated());

    await client.uploadReceipt(PARTS);

    expect(fake.uploads).toEqual([{ parts: PARTS }]);
  });

  it('mints no idempotency key of its own', async () => {
    // The producer content-addresses the bytes. A key invented here would be a
    // second dedup rule, and the first disagreement is two purchases for one
    // receipt.
    const { client, fake } = clientAnswering(purchasesCreated());

    await client.uploadReceipt(PARTS);

    expect(Object.keys(fake.uploads[0] as Record<string, unknown>)).toEqual(['parts']);
  });

  it('forwards the whole capture block verbatim', async () => {
    // Field for field, including the location. bfm is a proxy of what the
    // handset observed; reshaping any of it here would put this pillar's
    // opinion between a device and the pillar that owns the judgement.
    const { client, fake } = clientAnswering(purchasesCreated());
    const capture = {
      capturedAt: '2026-08-13T14:05:00+10:00',
      timeZone: 'Australia/Sydney',
      location: { latitude: -33.87, longitude: 151.21 },
    };

    await client.uploadReceipt(PARTS, capture);

    expect(fake.uploads).toEqual([{ parts: PARTS, capture }]);
  });

  it('sends no capture key at all when the handset supplied none', async () => {
    // Absent, not `capture: undefined`. The producer's body schema tells the
    // two apart, and relying on JSON dropping the key would be relying on a
    // coincidence rather than on the contract.
    const { client, fake } = clientAnswering(purchasesCreated());

    await client.uploadReceipt(PARTS);

    expect(Object.keys(fake.uploads[0] as Record<string, unknown>)).toEqual(['parts']);
  });

  it('forwards a partial capture block without filling the gaps', async () => {
    // A handset with location permission denied still knows its clock. bfm
    // inventing a zone from the timestamp's offset would be manufacturing
    // evidence the device declined to give.
    const { client, fake } = clientAnswering(purchasesCreated());

    await client.uploadReceipt(PARTS, { capturedAt: '2026-08-13T14:05:00+10:00' });

    expect(fake.uploads).toEqual([
      { parts: PARTS, capture: { capturedAt: '2026-08-13T14:05:00+10:00' } },
    ]);
  });

  it('does not judge a capture time bfm has no business judging', async () => {
    // A 2041 clock is the producer's to discard — it owns the upload instant
    // this has to be compared against. bfm deciding it too would be a second
    // rule, the same mistake as a second dedup key.
    const { client, fake } = clientAnswering(purchasesCreated());

    await client.uploadReceipt(PARTS, { capturedAt: '2041-03-02T09:00:00Z' });

    expect(fake.uploads).toEqual([
      { parts: PARTS, capture: { capturedAt: '2041-03-02T09:00:00Z' } },
    ]);
  });
});

describe('when the answer is not one bfm can use', () => {
  it('calls a shape it cannot read a contract-mismatch, not an outage', async () => {
    const { client } = clientAnswering({ kind: 'ok', value: { kind: 'created' } });

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'contract-mismatch',
      pillar: 'purchases',
      status: 502,
      detail: 'receipt.upload response did not match the expected shape',
    });
  });

  it('refuses a purchase date the phone could not parse', async () => {
    // A date that reaches the confirmation screen unparseable renders as a
    // blank or as today, and neither is distinguishable from a receipt that
    // stated no date — which purchases signals a completely different way.
    const { client } = clientAnswering(purchasesCreated({ orderedAt: '13/08/2026' }));

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome.kind).toBe('contract-mismatch');
  });

  it('accepts an offset timestamp, which purchases’ own contract admits', async () => {
    const { client } = clientAnswering(
      purchasesCreated({ orderedAt: '2026-08-13T12:15:00+10:00' })
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(isGatewayOk(outcome)).toBe(true);
  });

  it('treats an outcome arm it has never seen the same way', async () => {
    const { client } = clientAnswering({ kind: 'ok', value: { kind: 'quarantined' } });

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome.kind).toBe('contract-mismatch');
  });

  it('passes an unreachable purchases straight through as retryable', async () => {
    const { client } = clientAnswering({ kind: 'unavailable', pillar: 'purchases' });

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({ kind: 'unavailable', pillar: 'purchases', status: 503 });
  });

  it('reports a rejected service-account key as misconfiguration, never as the phone’s fault', async () => {
    const { client } = clientAnswering({
      kind: 'unauthorized',
      pillar: 'purchases',
      message: 'missing scope purchases.receipt',
    });

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'gateway-misconfigured',
      pillar: 'purchases',
      status: 502,
      detail: 'missing scope purchases.receipt',
    });
  });

  it('does not throw when purchases refuses the request itself', async () => {
    const { client } = clientAnswering({
      kind: 'bad-request',
      pillar: 'purchases',
      message: 'unsupported media type',
    });

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome.kind).toBe('invalid-request');
  });
});
