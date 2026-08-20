/**
 * A stand-in for the purchases pillar, behind a real {@link PillarGateway}.
 *
 * A fake HANDLE, not a fake gateway or a fake client: the gateway, the wire
 * validation and the outcome mapping are all production code under test, and
 * only the network is replaced. It answers whatever the test hands it, because
 * the interesting variation here is not the request — bfm sends the parts
 * through unchanged — but which of purchases' three outcomes came back, and
 * what bfm does with each.
 *
 * The recorded uploads are what proves "unchanged": a re-encode between the
 * handset and the producer would break the content-addressed dedup that makes
 * a retry idempotent, and nothing about the response would show it.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

export interface PurchasesFake {
  factory: PillarHandleFactory;
  /** Every `receipt.upload` input bfm sent, in order, verbatim. */
  uploads: unknown[];
}

/** A purchases whose `receipt.upload` answers `result`, whatever it is. */
export function createPurchasesFake(result: CallResult<unknown>): PurchasesFake {
  const uploads: unknown[] = [];

  const upload = (input: unknown): Promise<CallResult<unknown>> => {
    uploads.push(input);
    return Promise.resolve(result);
  };

  return {
    factory: <TRouter>() => fakePillarHandle<TRouter>('purchases', { receipt: { upload } }),
    uploads,
  };
}

/** The producer's `created` arm, as its REST layer serves one. */
export function purchasesCreated(
  overrides: {
    id?: string;
    merchantEntityName?: string | null;
    totalCents?: number;
    currency?: string;
    orderedAt?: string;
    itemCount?: number;
    alreadyStored?: boolean;
  } = {}
): CallResult<unknown> {
  const itemCount = overrides.itemCount ?? 3;

  return {
    kind: 'ok',
    value: {
      kind: 'created',
      alreadyStored: overrides.alreadyStored ?? false,
      purchase: {
        tags: [],
        purchase: {
          id: overrides.id ?? 'pur-1',
          source: 'receipt',
          sourceOrderId: null,
          merchantEntityName:
            overrides.merchantEntityName === undefined
              ? 'Woolworths'
              : overrides.merchantEntityName,
          merchantEntityId: null,
          totalCents: overrides.totalCents ?? 8420,
          currency: overrides.currency ?? 'AUD',
          orderedAt: overrides.orderedAt ?? '2026-08-13T02:15:00.000Z',
          status: 'settled',
        },
        // Length is the only thing bfm reads; the rows are otherwise the
        // producer's business and are deliberately not modelled here.
        items: Array.from({ length: itemCount }, (_unused, index) => ({ id: `item-${index}` })),
        shipments: [],
        charges: [],
        documents: [],
        accounting: {},
      },
    },
  };
}

/**
 * A reading as `purchases` serves one, with every defaulted field present.
 * Tests that care about an omission override it explicitly, so the difference
 * between "the producer sent this" and "the producer left it out" is visible
 * at the call site rather than buried here.
 */
export function purchasesExtracted(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    merchantName: 'Woolworths',
    address: '12 Example St',
    timeZone: 'Australia/Perth',
    purchasedOn: '2026-08-13',
    purchasedAt: '14:05',
    currency: 'AUD',
    total: '$84.20',
    tax: '$7.65',
    discounts: ['$2.00'],
    surcharges: ['$0.50'],
    shipping: null,
    lines: [{ description: 'MILK 2L', amount: '$3.10', quantity: 2, unitNote: '2 @ $1.55' }],
    unreadable: ['line 7 is smudged'],
    ...overrides,
  };
}

/** The producer's `needs-review` arm: read, but the arithmetic disagreed. */
export function purchasesNeedsReview(
  failures: readonly { kind: string; detail: string; deltaCents?: number }[],
  overrides: {
    receiptUris?: readonly string[];
    extracted?: Record<string, unknown>;
  } = {}
): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      kind: 'needs-review',
      receiptUris: overrides.receiptUris ?? ['pops://purchases/receipt/abc'],
      failures,
      extracted: overrides.extracted ?? purchasesExtracted(),
    },
  };
}

/** The producer's `unreadable` arm: nothing usable came back from the model. */
export function purchasesUnreadable(reason: string): CallResult<unknown> {
  return {
    kind: 'ok',
    value: { kind: 'unreadable', receiptUris: ['pops://purchases/receipt/abc'], reason },
  };
}
