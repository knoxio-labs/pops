/**
 * bfm's purchases leg: orders a handset can read, and — since POPS-2454 —
 * purchases it can write, expressed as calls to the purchases pillar.
 *
 * The reads are pure proxies of the producer's own record. The writes
 * (`extractReceipt`, `saveReceiptDraft`, `createManualPurchase`, defined in
 * `draft-client.ts` and merged into {@link MobilePurchasesClient} here) are
 * proxies of content the DEVICE decided, never of a judgement bfm makes:
 * extraction persists nothing, and a save or a manual entry carries the
 * idempotency key the reviewer's own device chose, so a retry is refused as
 * a repeat rather than becoming a second purchase.
 *
 * Like the finance leg, every call goes through the {@link PillarGateway}, so a
 * half-broken federation arrives as a value with a kind rather than an
 * exception, and leaves the same way. Nothing here throws, catches, or turns a
 * failed write into a plausible-looking outcome: "purchases could not be
 * reached" and "purchases refused the write" are different facts and the
 * phone draws them differently.
 */
import { type GatewayOutcome, type PillarGateway, isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { createManualPurchase, extractReceipt, saveReceiptDraft } from './draft-client.js';
import { encodePurchasesCursor, type PurchasesPageCursor } from './list-cursor.js';
import {
  PurchasesDetailResponseSchema,
  PurchasesListResponseSchema,
  toMobilePurchase,
  toMobilePurchaseDetail,
  type PurchasesListRow,
} from './list-wire.js';
import { PURCHASES_PILLAR_ID } from './pillar-id.js';
import { PurchasesReceiptBytesSchema } from './wire.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

import type { MobileCaptureMetadata } from '../../contract/capture.js';
import type {
  MobileCreateManualPurchaseBody,
  MobileExtractOutcome,
  MobileSaveReceiptDraftBody,
} from '../../contract/receipt-draft.js';
import type {
  MobilePurchaseDetail,
  MobilePurchasesPage,
  MobileReceiptBytes,
  MobileReceiptPart,
} from '../../contract/rest-schemas.js';

export { PURCHASES_PILLAR_ID };

/**
 * The subset of purchases' router bfm calls to read orders. A `type` rather
 * than an `interface` so it satisfies the SDK proxy's `Record<string,
 * unknown>` constraint.
 *
 * An assertion about a peer, not a compile-time link to one — `list-wire.ts`
 * validates what comes back, which is where the guarantee lives. The
 * receipt-draft calls (`extractReceipt`, `saveReceiptDraft`,
 * `createManualPurchase`) carry their own router assertion in
 * `draft-client.ts`.
 */
export type PurchasesReceiptRouter = {
  purchase: {
    list: (input: {
      limit?: number;
      beforeOrderedAt?: string;
      beforeId?: string;
    }) => Promise<unknown>;
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
  extractReceipt(
    parts: readonly MobileReceiptPart[],
    capture?: MobileCaptureMetadata
  ): Promise<GatewayOutcome<MobileExtractOutcome>>;
  saveReceiptDraft(body: MobileSaveReceiptDraftBody): Promise<GatewayOutcome<MobilePurchaseDetail>>;
  createManualPurchase(
    body: MobileCreateManualPurchaseBody
  ): Promise<GatewayOutcome<MobilePurchaseDetail>>;
  listPurchases(request: ListPurchasesRequest): Promise<GatewayOutcome<MobilePurchasesPage>>;
  getPurchase(id: string): Promise<GatewayOutcome<MobilePurchaseDetail>>;
  getReceipt(sha256: string): Promise<GatewayOutcome<MobileReceiptBytes>>;
  getReceiptThumbnail(sha256: string): Promise<GatewayOutcome<MobileReceiptBytes>>;
}

export function createMobilePurchasesClient(gateway: PillarGateway): MobilePurchasesClient {
  return {
    extractReceipt: (parts, capture) => extractReceipt(gateway, parts, capture),
    saveReceiptDraft: (body) => saveReceiptDraft(gateway, body),
    createManualPurchase: (body) => createManualPurchase(gateway, body),

    async listPurchases(request: ListPurchasesRequest) {
      // One row past the page, exactly as the finance leg does: the extra
      // row's existence is what proves another page exists, and asking the
      // producer for a total instead would be a second count query per scroll
      // tick answering with a number that is stale the moment it is read.
      const outcome = await gateway.call<PurchasesReceiptRouter, unknown>(
        PURCHASES_PILLAR_ID,
        (handle) => handle.purchase.list(toListInput(request))
      );

      const page = parseOrMismatch(
        PURCHASES_PILLAR_ID,
        outcome,
        PurchasesListResponseSchema,
        'purchase.list'
      );
      if (!isGatewayOk(page)) return page;

      return { kind: 'ok', value: toPage(page.value.items, request.limit) };
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

/** The wire input one `purchase.list` call sends for a page request. */
function toListInput(request: ListPurchasesRequest): {
  limit: number;
  beforeOrderedAt?: string;
  beforeId?: string;
} {
  return {
    limit: request.limit + 1,
    beforeOrderedAt: request.cursor?.orderedAt,
    beforeId: request.cursor?.id,
  };
}

/**
 * Trim the probe row off the over-fetched page and mint the next cursor.
 *
 * The cursor names the LAST ROW SERVED, not the probe: naming the probe row
 * would anchor the next page one row too far forward, since the app never saw
 * it and could not have served it.
 */
function toPage(rows: readonly PurchasesListRow[], limit: number): MobilePurchasesPage {
  const hasMore = rows.length > limit;
  const served = hasMore ? rows.slice(0, limit) : rows;
  const last = served.at(-1);

  return {
    data: served.map(toMobilePurchase),
    nextCursor:
      hasMore && last !== undefined
        ? encodePurchasesCursor({ orderedAt: last.orderedAt, id: last.id })
        : null,
  };
}
