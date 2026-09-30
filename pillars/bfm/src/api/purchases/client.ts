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
import { createMobileContactsClient, type MobileContactsClient } from '../contacts/client.js';
import { fetchMatchedTransactions } from '../finance/matched-transactions.js';
import { type GatewayOutcome, type PillarGateway, isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { matchedTransactionIds } from './bank-match-wire.js';
import { createManualPurchase, extractReceipt, saveReceiptDraft } from './draft-client.js';
import { type PurchasesPageCursor } from './list-cursor.js';
import { distinctEntityIds, resolveMergedNames, servedRows, toPage } from './list-page.js';
import {
  PurchasesDetailResponseSchema,
  PurchasesListResponseSchema,
  toMobilePurchaseDetail,
} from './list-wire.js';
import { PurchasesMonthSummaryResponseSchema, toMobileMonthSummary } from './month-summary-wire.js';
import { fetchPurchaseReceiptBytes } from './receipt-bytes-client.js';
import { search, tagVocabulary, type SearchPurchasesRequest } from './search-client.js';
import { updatePurchase } from './update-client.js';

import type { MobileCaptureMetadata } from '../../contract/capture.js';
import type {
  MobilePurchaseTagsQuery,
  MobilePurchaseSearchResponse,
  MobilePurchaseTagsResponse,
} from '../../contract/mobile-purchases-schemas.js';
import type {
  MobileCreateManualPurchaseBody,
  MobileExtractOutcome,
  MobileSaveReceiptDraftBody,
} from '../../contract/receipt-draft.js';
import type {
  MobileMonthSummary,
  MobilePurchaseDetail,
  MobilePurchasesPage,
  MobileReceiptBytes,
  MobileReceiptPart,
  MobileUpdatePurchaseBody,
} from '../../contract/rest-schemas.js';

/**
 * The purchases pillar id, as registered with the registry.
 *
 * Declared here rather than imported from a shared module on purpose:
 * `scripts/ci/check-cross-pillar-expectations.mjs` resolves a `pillar()`
 * call's target from the calling file alone, so an imported constant is
 * undecidable and the expectation cannot be pinned. `finance/client.ts` and
 * `finance/accounts-client.ts` each carry their own for the same reason.
 */
export const PURCHASES_PILLAR_ID = 'purchases';

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
      statuses?: string[];
    }) => Promise<unknown>;
    get: (input: { id: string }) => Promise<unknown>;
  };
};

/** The `analytics.*` sub-router bfm reads the month summary through. */
export type PurchasesAnalyticsRouter = {
  analytics: {
    monthSummary: (input: { month: string }) => Promise<unknown>;
  };
};

export interface ListPurchasesRequest {
  /** Rows to return. The caller has already clamped this to the contract's cap. */
  readonly limit: number;
  /** Where the previous page stopped, or `null` for the first page. */
  readonly cursor: PurchasesPageCursor | null;
  /** Raw purchases-pillar status strings. A dumb proxy — no policy here. */
  readonly statuses?: readonly string[];
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
  updatePurchase(
    id: string,
    body: MobileUpdatePurchaseBody
  ): Promise<GatewayOutcome<MobilePurchaseDetail>>;
  getReceipt(sha256: string): Promise<GatewayOutcome<MobileReceiptBytes>>;
  getReceiptThumbnail(sha256: string): Promise<GatewayOutcome<MobileReceiptBytes>>;
  getMonthSummary(month: string): Promise<GatewayOutcome<MobileMonthSummary>>;
  search(request: SearchPurchasesRequest): Promise<GatewayOutcome<MobilePurchaseSearchResponse>>;
  tagVocabulary(
    request: MobilePurchaseTagsQuery
  ): Promise<GatewayOutcome<MobilePurchaseTagsResponse>>;
}

export function createMobilePurchasesClient(
  gateway: PillarGateway,
  contacts: MobileContactsClient = createMobileContactsClient(gateway)
): MobilePurchasesClient {
  return {
    extractReceipt: (parts, capture) => extractReceipt(gateway, parts, capture),
    saveReceiptDraft: (body) => saveReceiptDraft(gateway, body),
    createManualPurchase: (body) => createManualPurchase(gateway, body),

    listPurchases: (request) => listPurchases(gateway, contacts, request),
    getPurchase: (id) => getPurchase(gateway, contacts, id),
    updatePurchase: (id, body) => updatePurchase(gateway, id, body),

    async getReceipt(sha256: string) {
      return fetchPurchaseReceiptBytes(gateway, 'receipt.read', (handle) =>
        handle.receipt.read({ sha256 })
      );
    },

    async getReceiptThumbnail(sha256: string) {
      return fetchPurchaseReceiptBytes(gateway, 'receipt.thumbnail', (handle) =>
        handle.receipt.thumbnail({ sha256 })
      );
    },

    async getMonthSummary(month: string) {
      const outcome = await gateway.call<PurchasesAnalyticsRouter, unknown>(
        PURCHASES_PILLAR_ID,
        (handle) => handle.analytics.monthSummary({ month })
      );

      const summary = parseOrMismatch(
        PURCHASES_PILLAR_ID,
        outcome,
        PurchasesMonthSummaryResponseSchema,
        'analytics.monthSummary'
      );
      if (!isGatewayOk(summary)) return summary;

      return { kind: 'ok', value: toMobileMonthSummary(summary.value) };
    },

    search: (request) => search(gateway, request),
    tagVocabulary: (request) => tagVocabulary(gateway, request),
  };
}

/** The wire input one `purchase.list` call sends for a page request. */
function toListInput(request: ListPurchasesRequest): {
  limit: number;
  beforeOrderedAt?: string;
  beforeId?: string;
  statuses?: string[];
} {
  return {
    limit: request.limit + 1,
    beforeOrderedAt: request.cursor?.orderedAt,
    beforeId: request.cursor?.id,
    statuses: request.statuses === undefined ? undefined : [...request.statuses],
  };
}

async function listPurchases(
  gateway: PillarGateway,
  contacts: MobileContactsClient,
  request: ListPurchasesRequest
): Promise<GatewayOutcome<MobilePurchasesPage>> {
  // One row past the page, exactly as the finance leg does: the extra row's
  // existence is what proves another page exists, and asking the producer
  // for a total instead would be a second count query per scroll tick
  // answering with a number that is stale the moment it is read.
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

  const hasMore = page.value.items.length > request.limit;
  const served = servedRows(page.value.items, request.limit);
  const mergedNames = await resolveMergedNames(contacts, distinctEntityIds(served));

  return { kind: 'ok', value: toPage(served, hasMore, mergedNames, page.value.total) };
}

async function getPurchase(
  gateway: PillarGateway,
  contacts: MobileContactsClient,
  id: string
): Promise<GatewayOutcome<MobilePurchaseDetail>> {
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

  const entityId = detail.value.purchase.merchantEntityId ?? null;
  const [mergedNames, transactions] = await Promise.all([
    resolveMergedNames(contacts, entityId === null ? [] : [entityId]),
    fetchMatchedTransactions(gateway, matchedTransactionIds(detail.value.charges)),
  ]);

  return { kind: 'ok', value: toMobilePurchaseDetail(detail.value, mergedNames, transactions) };
}
