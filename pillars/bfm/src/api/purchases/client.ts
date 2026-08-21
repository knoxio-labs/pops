/**
 * bfm's purchases leg: the receipt a handset photographed, expressed as a call
 * to the purchases pillar.
 *
 * The first write bfm makes on the phone's behalf, and it is a proxy of content
 * rather than a command: the bytes are the device's, and everything downstream
 * of accepting them — reading them, gating the reading against the receipt's
 * own total, deduping the file, creating the purchase — belongs to `purchases`.
 * bfm adds no idempotency key for that reason (ADR-046); the producer
 * content-addresses the bytes, so a retry is the same photograph and the same
 * purchase. The capture metadata beside them is proxied on the same terms:
 * forwarded whole, judged nowhere — see `../../contract/rest-schemas.ts` and
 * ADR-047.
 *
 * Like the finance leg, every call goes through the {@link PillarGateway}, so a
 * half-broken federation arrives as a value with a kind rather than an
 * exception, and leaves the same way. Nothing here throws, catches, or turns a
 * failed upload into a plausible-looking outcome: "purchases could not be
 * reached" and "purchases could not read the receipt" are different facts and
 * the phone draws them differently.
 */
import { type GatewayOutcome, type PillarGateway, isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { encodePurchasesCursor, type PurchasesPageCursor } from './list-cursor.js';
import {
  PurchasesDetailResponseSchema,
  PurchasesListResponseSchema,
  toMobilePurchase,
  toMobilePurchaseDetail,
  type PurchasesListRow,
} from './list-wire.js';
import {
  PurchasesReceiptBytesSchema,
  PurchasesReceiptOutcomeSchema,
  toMobileReceiptOutcome,
} from './wire.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

import type { MobileCaptureMetadata } from '../../contract/capture.js';
import type {
  MobilePurchaseDetail,
  MobilePurchasesPage,
  MobileReceiptBytes,
  MobileReceiptOutcome,
  MobileReceiptPart,
} from '../../contract/rest-schemas.js';

/** The purchases pillar id, as registered with the registry. */
export const PURCHASES_PILLAR_ID = 'purchases';

/**
 * The subset of purchases' router bfm calls. A `type` rather than an
 * `interface` so it satisfies the SDK proxy's `Record<string, unknown>`
 * constraint.
 *
 * An assertion about a peer, not a compile-time link to one — `wire.ts`
 * validates what comes back, which is where the guarantee lives.
 */
export type PurchasesReceiptRouter = {
  receipt: {
    upload: (input: {
      parts: readonly MobileReceiptPart[];
      capture?: MobileCaptureMetadata;
    }) => Promise<unknown>;
  };
  purchase: {
    list: (input: { limit?: number; offset?: number }) => Promise<unknown>;
    get: (input: { id: string }) => Promise<unknown>;
  };
};

/**
 * The receipt-bytes half of purchases' `receipt.*` router.
 *
 * Separate from {@link PurchasesReceiptRouter} only because the upload half
 * predates it; both name routes on the same producer sub-router and both are
 * assertions about a peer rather than a compile-time link to one.
 */
export type PurchasesReceiptBytesRouter = {
  receipt: {
    read: (input: { sha256: string }) => Promise<unknown>;
    thumbnail: (input: { sha256: string }) => Promise<unknown>;
  };
};

export interface ListPurchasesRequest {
  /** Rows to return. The caller has already clamped this to the contract's cap. */
  readonly limit: number;
  /** Where the previous page stopped, or `null` for the first page. */
  readonly cursor: PurchasesPageCursor | null;
}

export interface MobilePurchasesClient {
  uploadReceipt(
    parts: readonly MobileReceiptPart[],
    capture?: MobileCaptureMetadata
  ): Promise<GatewayOutcome<MobileReceiptOutcome>>;
  listPurchases(request: ListPurchasesRequest): Promise<GatewayOutcome<MobilePurchasesPage>>;
  getPurchase(id: string): Promise<GatewayOutcome<MobilePurchaseDetail>>;
  getReceipt(sha256: string): Promise<GatewayOutcome<MobileReceiptBytes>>;
  getReceiptThumbnail(sha256: string): Promise<GatewayOutcome<MobileReceiptBytes>>;
}

export function createMobilePurchasesClient(gateway: PillarGateway): MobilePurchasesClient {
  return {
    async uploadReceipt(parts: readonly MobileReceiptPart[], capture?: MobileCaptureMetadata) {
      // The parts travel unchanged. Re-encoding them here would be a second
      // representation of bytes the producer content-addresses, so a byte-level
      // difference would break its dedup and turn a retry into a second
      // purchase.
      // The capture block travels unchanged too, and is omitted entirely when
      // the handset sent none rather than passed as an explicit `undefined`:
      // the producer's body schema distinguishes absent from present, and
      // relying on JSON dropping the key would be relying on a coincidence.
      const outcome = await gateway.call<PurchasesReceiptRouter, unknown>(
        PURCHASES_PILLAR_ID,
        (handle) => handle.receipt.upload(capture === undefined ? { parts } : { parts, capture })
      );

      const answered = parseOrMismatch(
        PURCHASES_PILLAR_ID,
        outcome,
        PurchasesReceiptOutcomeSchema,
        'receipt.upload'
      );
      if (!isGatewayOk(answered)) return answered;

      return { kind: 'ok', value: toMobileReceiptOutcome(answered.value) };
    },

    async listPurchases(request: ListPurchasesRequest) {
      // One row past the page, exactly as the finance leg does: the extra
      // row's existence is what proves another page exists, and asking the
      // producer for a total instead would be a second count query per scroll
      // tick answering with a number that is stale the moment it is read.
      const offset = request.cursor?.o ?? 0;
      const outcome = await gateway.call<PurchasesReceiptRouter, unknown>(
        PURCHASES_PILLAR_ID,
        (handle) => handle.purchase.list({ limit: request.limit + 1, offset })
      );

      const page = parseOrMismatch(
        PURCHASES_PILLAR_ID,
        outcome,
        PurchasesListResponseSchema,
        'purchase.list'
      );
      if (!isGatewayOk(page)) return page;

      return { kind: 'ok', value: toPage(page.value.items, request.limit, offset) };
    },

    async getPurchase(id: string) {
      const outcome = await gateway.call<PurchasesReceiptRouter, unknown>(
        PURCHASES_PILLAR_ID,
        (handle) => handle.purchase.get({ id })
      );

      const detail = parseOrMismatch(
        PURCHASES_PILLAR_ID,
        outcome,
        PurchasesDetailResponseSchema,
        'purchase.get'
      );
      if (!isGatewayOk(detail)) return detail;

      return { kind: 'ok', value: toMobilePurchaseDetail(detail.value) };
    },

    async getReceipt(sha256: string) {
      return fetchReceiptBytes(gateway, 'receipt.read', (handle) =>
        handle.receipt.read({ sha256 })
      );
    },

    async getReceiptThumbnail(sha256: string) {
      return fetchReceiptBytes(gateway, 'receipt.thumbnail', (handle) =>
        handle.receipt.thumbnail({ sha256 })
      );
    },
  };
}

/**
 * The two byte routes differ only in which one they call.
 *
 * The bytes are passed through unchanged rather than re-encoded: `purchases`
 * named the file for the SHA-256 of what it holds, and a round trip through
 * decode-and-re-encode would put a representation bfm chose in front of a
 * client that may well be checking the hash.
 */
async function fetchReceiptBytes(
  gateway: PillarGateway,
  operation: string,
  invoke: (handle: PillarHandle<PurchasesReceiptBytesRouter>) => Promise<CallResult<unknown>>
): Promise<GatewayOutcome<MobileReceiptBytes>> {
  const outcome = await gateway.call<PurchasesReceiptBytesRouter, unknown>(
    PURCHASES_PILLAR_ID,
    invoke
  );

  const answered = parseOrMismatch(
    PURCHASES_PILLAR_ID,
    outcome,
    PurchasesReceiptBytesSchema,
    operation
  );
  if (!isGatewayOk(answered)) return answered;

  return { kind: 'ok', value: answered.value };
}

/**
 * Trim the probe row off the over-fetched page and mint the next cursor.
 *
 * The cursor counts rows SERVED, not rows fetched: naming the probe row would
 * skip it, since the app never saw it.
 */
function toPage(
  rows: readonly PurchasesListRow[],
  limit: number,
  offset: number
): MobilePurchasesPage {
  const hasMore = rows.length > limit;
  const served = hasMore ? rows.slice(0, limit) : rows;

  return {
    data: served.map(toMobilePurchase),
    nextCursor: hasMore ? encodePurchasesCursor({ o: offset + served.length }) : null,
  };
}
