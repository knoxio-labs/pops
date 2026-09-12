/**
 * A stand-in for purchases' `receipt.extract`, `receipt.saveDraft` and
 * `purchase.createManual` — the three POPS-2454 calls — behind a real
 * {@link PillarGateway}.
 *
 * A fake HANDLE, not a fake gateway or client, matching `purchases-read-fake.ts`'s
 * own posture: the gateway, the wire validation and the outcome mapping are
 * all production code under test, and only the network is replaced.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

export interface PurchasesDraftFake {
  factory: PillarHandleFactory;
  /** Every `receipt.extract` input bfm sent, in order, verbatim. */
  extracted: unknown[];
  /** Every `receipt.saveDraft` input bfm sent, in order, verbatim. */
  saved: unknown[];
  /** Every `purchase.createManual` input bfm sent, in order, verbatim. */
  created: unknown[];
}

/**
 * A purchases whose `receipt.extract` answers `extractResult`, whose
 * `receipt.saveDraft` and `purchase.createManual` both answer
 * `writeResult`.
 */
export function createPurchasesDraftFake(
  extractResult: CallResult<unknown>,
  writeResult: CallResult<unknown> = extractResult
): PurchasesDraftFake {
  const extracted: unknown[] = [];
  const saved: unknown[] = [];
  const created: unknown[] = [];

  const extract = (input: unknown): Promise<CallResult<unknown>> => {
    extracted.push(input);
    return Promise.resolve(extractResult);
  };
  const saveDraft = (input: unknown): Promise<CallResult<unknown>> => {
    saved.push(input);
    return Promise.resolve(writeResult);
  };
  const createManual = (input: unknown): Promise<CallResult<unknown>> => {
    created.push(input);
    return Promise.resolve(writeResult);
  };

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('purchases', {
        receipt: { extract, saveDraft },
        purchase: { createManual },
      }),
    extracted,
    saved,
    created,
  };
}

/** The producer's `receipt.extract` `draft` arm, as its REST layer serves one. */
export function purchasesDraft(
  overrides: {
    reconciled?: boolean;
    failures?: readonly { kind: string; detail: string; deltaCents?: number }[];
    receiptUris?: readonly string[];
    draft?: Record<string, unknown>;
  } = {}
): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      kind: 'draft',
      receiptUris: overrides.receiptUris ?? ['pops://purchases/receipt/' + 'a'.repeat(64)],
      reconciled: overrides.reconciled ?? true,
      failures: overrides.failures ?? [],
      draft: {
        merchantEntityName: 'Bunnings Warehouse',
        orderedAt: '2026-08-01T14:32:00+10:00',
        currency: 'AUD',
        totalCents: 2750,
        subtotalCents: 2750,
        taxCents: 0,
        surchargeCents: 0,
        shippingCents: 0,
        discountCents: 0,
        items: [{ name: 'Timber Pine DAR 42x19', unitPriceCents: 1250, lineTotalCents: 1250 }],
        documents: [{ documentUri: 'pops://purchases/receipt/' + 'a'.repeat(64), kind: 'receipt' }],
        ...overrides.draft,
      },
    },
  };
}

/** `receipt.extract`'s `unreadable` arm. */
export function purchasesDraftUnreadable(reason: string): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      kind: 'unreadable',
      receiptUris: ['pops://purchases/receipt/' + 'a'.repeat(64)],
      reason,
    },
  };
}

/** What `receipt.saveDraft` and `purchase.createManual` both answer on success. */
export function purchasesPurchaseDetail(
  overrides: {
    id?: string;
    source?: string;
    merchantEntityName?: string | null;
    totalCents?: number;
  } = {}
): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      purchase: {
        id: overrides.id ?? 'pur-1',
        source: overrides.source ?? 'receipt',
        merchantEntityName: overrides.merchantEntityName ?? 'Bunnings Warehouse',
        totalCents: overrides.totalCents ?? 2750,
        subtotalCents: overrides.totalCents ?? 2750,
        taxCents: 0,
        shippingCents: 0,
        discountCents: 0,
        surchargeCents: 0,
        currency: 'AUD',
        orderedAt: '2026-08-01T14:32:00+10:00',
        orderedAtOffsetMinutes: 600,
        status: 'awaiting_settlement',
      },
      items: [],
      documents: [],
    },
  };
}
