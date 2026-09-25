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

/** An idempotency key, read off whatever shape the caller sent. */
function idempotencyKeyOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const key = (input as { idempotencyKey?: unknown }).idempotencyKey;
  return typeof key === 'string' ? key : undefined;
}

/**
 * A purchases whose `receipt.extract` answers `extractResult`, whose
 * `receipt.saveDraft` and `purchase.createManual` both answer
 * `writeResult`.
 *
 * A key `saveDraft` or `createManual` has already answered `ok` for is
 * replayed as that same `ok` result — mirroring the producer's own replay
 * behaviour (`close-out/3646-replay-returns-purchase-server`) — rather than
 * re-evaluating `writeResult`, so a test can pass a `conflict` fixture and
 * still assert that a *repeat* of an already-succeeded key comes back `200`
 * instead of that conflict.
 */
export function createPurchasesDraftFake(
  extractResult: CallResult<unknown>,
  writeResult: CallResult<unknown> = extractResult
): PurchasesDraftFake {
  const extracted: unknown[] = [];
  const saved: unknown[] = [];
  const created: unknown[] = [];
  const answeredKeys = new Map<string, CallResult<unknown>>();

  const extract = (input: unknown): Promise<CallResult<unknown>> => {
    extracted.push(input);
    return Promise.resolve(extractResult);
  };

  const replayable =
    (log: unknown[]) =>
    (input: unknown): Promise<CallResult<unknown>> => {
      log.push(input);
      const key = idempotencyKeyOf(input);
      const already = key === undefined ? undefined : answeredKeys.get(key);
      if (already !== undefined) return Promise.resolve(already);

      if (key !== undefined && writeResult.kind === 'ok') {
        answeredKeys.set(key, writeResult);
      }
      return Promise.resolve(writeResult);
    };

  const saveDraft = replayable(saved);
  const createManual = replayable(created);

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
    matchedMerchantEntityId?: string | null;
  } = {}
): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      kind: 'draft',
      receiptUris: overrides.receiptUris ?? ['pops://purchases/receipt/' + 'a'.repeat(64)],
      reconciled: overrides.reconciled ?? true,
      failures: overrides.failures ?? [],
      matchedMerchantEntityId: overrides.matchedMerchantEntityId ?? null,
      draft: {
        merchantEntityName: 'Bunnings Warehouse',
        orderedAt: '2026-08-01T14:32:00+10:00',
        // A real offset by default: a null one cannot tell a mapping that
        // carries the field from one that drops it (POPS-2530).
        orderedAtOffsetMinutes: 600,
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
    merchantEntityId?: string | null;
    merchantEntityName?: string | null;
    totalCents?: number;
  } = {}
): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      edit: null,
      purchase: {
        id: overrides.id ?? 'pur-1',
        source: overrides.source ?? 'receipt',
        merchantEntityId: overrides.merchantEntityId ?? null,
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
        updatedAt: '2026-08-01T14:32:00.000Z',
      },
      items: [],
      charges: [],
      accounting: {
        totalCents: overrides.totalCents ?? 2750,
        matchedCents: 0,
        awaitingImportCents: overrides.totalCents ?? 2750,
        residualCents: 0,
        refundedCents: 0,
        netSpendCents: overrides.totalCents ?? 2750,
      },
      documents: [],
    },
  };
}
