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
  it('narrows needs-review to the problems, dropping the extracted reading', async () => {
    const { client } = clientAnswering(
      purchasesNeedsReview([
        { kind: 'sum-mismatch', detail: 'lines fall 240c short of the stated total' },
        { kind: 'unreadable-line', detail: 'line 7 is illegible' },
      ])
    );

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'ok',
      value: {
        kind: 'needs-review',
        problems: [
          { code: 'sum-mismatch', detail: 'lines fall 240c short of the stated total' },
          { code: 'unreadable-line', detail: 'line 7 is illegible' },
        ],
      },
    });
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
      { code: 'a-reason-invented-later', detail: 'whatever it is' },
    ]);
  });

  it('carries the unreadable reason through unchanged', async () => {
    const { client } = clientAnswering(purchasesUnreadable('no text was found in the image'));

    const outcome = await client.uploadReceipt(PARTS);

    expect(outcome).toEqual({
      kind: 'ok',
      value: { kind: 'unreadable', reason: 'no text was found in the image' },
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
