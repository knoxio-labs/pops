import { MERCHANT_SPEND } from '../fixtures/merchant-spend';
import { ORDER, ORDER_ID } from '../fixtures/order';
import { ORDER_INDEX_ROW } from '../fixtures/order-index';
import { PRODUCT_DICTIONARY } from '../fixtures/product-dictionary';
import { RECEIPT_DRAFT } from '../fixtures/receipt-draft';
import { RECONCILE_QUEUE } from '../fixtures/reconcile-queue';
import {
  RECEIPT_IMAGE,
  RECEIPT_SHA256,
  SOURCE,
  attachDocument,
  createInventoryItem,
  decideInventoryProposal,
  patchItem,
  reconcileLinks,
  renameProduct,
  updateAlias,
} from './fixture-answers';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AnalyticsProductLeaderboardResponses,
  PurchaseCreateResponses,
  PurchaseItemsByTagResponses,
  ReconcileConfirmResponses,
  ReconcileLinksBatchResponses,
  ReconcileSweepResponses,
} from '../../purchases-api/types.gen';

/**
 * One handler per operation the purchases OpenAPI document declares.
 *
 * Every operation, not only the ones the four pages read: the coverage test
 * compares these keys against the committed contract and fails on either
 * direction, so a new endpoint cannot ship without an answer here and a
 * handler cannot outlive the operation it answers. That is the whole point of
 * keying on the contract rather than on the app's call sites — a mock layer
 * that covers what the app happens to call today silently stops covering it
 * the day the app calls something else.
 *
 * The reads behind the four pages return the fixtures. The rest return the
 * smallest response their contract admits: a standalone harness is for seeing
 * and working on the UI, and a write that answers plausibly is enough for the
 * view to advance. Where a write's answer feeds the view something it renders
 * — the proposal pass's outcome, a receipt's three-way result — the shape is
 * chosen to be the interesting one rather than the empty one.
 */

const ok =
  <T>(body: T): MockHandler =>
  () => ({ body });

const created =
  <T>(body: T): MockHandler =>
  () => ({ status: 201, body });

/** `{ ok: true }`, the contract's answer for a write with nothing to report. */
const acknowledged: MockHandler = () => ({ body: { ok: true } });

export const handlers: MockHandlers = {
  // ── Reconcile ────────────────────────────────────────────────────────────
  'GET /reconcile/queue': ok(RECONCILE_QUEUE),
  'GET /reconcile/links': reconcileLinks,
  'POST /reconcile/links/batch': ok<ReconcileLinksBatchResponses[200]>({ transactions: [] }),
  'POST /reconcile/confirm': ok<ReconcileConfirmResponses[200]>({ ok: true, matchRuleId: null }),
  'POST /reconcile/unlink': acknowledged,
  'POST /reconcile/reject': acknowledged,
  'POST /reconcile/sweep': ok<ReconcileSweepResponses[200]>({
    kind: 'swept',
    chargesConsidered: RECONCILE_QUEUE.items.length,
    derivedChargesMinted: 0,
    linksTornDown: 0,
    linksWritten: 0,
    reviewCount: RECONCILE_QUEUE.items.length,
  }),

  // ── Orders ───────────────────────────────────────────────────────────────
  'GET /purchases': ok({ items: [ORDER_INDEX_ROW], total: 1 }),
  // The id is honoured rather than ignored: the detail page's "no such order"
  // state is a real answer the page renders differently, and a mock that
  // returned the one fixture for every id would make it unreachable.
  'GET /purchases/{id}': ({ params }) =>
    params['id'] === ORDER_ID
      ? { body: ORDER }
      : { status: 404, body: { code: 'NOT_FOUND', message: 'No such purchase' } },
  'POST /purchases': created<PurchaseCreateResponses[201]>(ORDER),
  'PATCH /purchases/{id}': ok(ORDER),
  'DELETE /purchases/{id}': acknowledged,
  'DELETE /purchases/{id}/capture/location': acknowledged,
  'PATCH /purchases/{id}/items/{itemId}': patchItem,
  'POST /purchases/{id}/documents': attachDocument,
  'GET /purchases/{id}/inventory-proposals': ok({ proposals: [] }),
  'POST /purchases/{id}/items/{itemId}/inventory-item': createInventoryItem,
  'POST /purchases/{id}/items/{itemId}/inventory-proposal': decideInventoryProposal,
  'GET /items': ok<PurchaseItemsByTagResponses[200]>({
    items: [],
    pagination: { hasMore: false, limit: 50, offset: 0, total: 0 },
  }),
  'GET /items/tags': ok({ tags: [] }),

  // ── Products ─────────────────────────────────────────────────────────────
  'GET /products': ok(PRODUCT_DICTIONARY),
  'PATCH /products/{productId}': renameProduct,
  'DELETE /products/{productId}': acknowledged,
  'PATCH /products/aliases/{aliasId}': updateAlias,
  'DELETE /products/aliases/{aliasId}': acknowledged,
  // Reported in full because the panel renders every counter, including the
  // retirals, which is the number the page exists to make visible.
  'POST /products/proposals': ok({
    confirmed: 2,
    observedWordings: 4,
    proposed: 1,
    retired: 1,
    scannedLines: 12,
  }),

  // ── Analytics ────────────────────────────────────────────────────────────
  'GET /analytics/merchant-spend': ok(MERCHANT_SPEND),
  'GET /analytics/month-summary': ok({
    month: '2026-08',
    totals: [
      {
        currency: 'AUD',
        orderCount: 1,
        accounting: {
          totalCents: 5678,
          matchedCents: 5678,
          awaitingImportCents: 0,
          residualCents: 0,
          refundedCents: 0,
          netSpendCents: 5678,
        },
      },
    ],
    purchaseCount: 1,
    previousMonthTotals: null,
    unmatchedCount: 1,
    merchantLeaders: [],
  }),
  'GET /analytics/product-leaderboard': ok<AnalyticsProductLeaderboardResponses[200]>({
    minOrderCount: 1,
    period: { from: null, to: null },
    products: [],
    coverage: {
      confirmedProductLines: 2,
      lineCount: 3,
      nameKeyedLines: 3,
      productCount: PRODUCT_DICTIONARY.products.length,
      proposedProductLines: 1,
      skuKeyedLines: 1,
      unidentifiedLines: 0,
    },
  }),

  // ── Receipts ─────────────────────────────────────────────────────────────
  // `created` rather than `needs-review`: the drop zone's happy path is what a
  // standalone reader is most likely to try first, and the other two outcomes
  // are reachable by editing this one line.
  'POST /receipts': ok({ kind: 'created', alreadyStored: false, purchase: ORDER }),
  // Reading and saving are separate calls now. The reading answers a draft
  // and persists nothing, so a standalone reader can open the review screen
  // without a write ever happening; `reconciled: false` plus a failure is
  // the other state that screen has to draw, reachable by editing these two
  // lines rather than by wiring a second fixture.
  'POST /receipts/extract': ok({
    kind: 'draft',
    receiptUris: [`pops://purchases/receipt/${RECEIPT_SHA256}`],
    reconciled: true,
    failures: [],
    matchedMerchantEntityId: null,
    draft: RECEIPT_DRAFT,
  }),
  'POST /receipts/draft': ok(ORDER),
  'POST /purchases/manual': ok(ORDER),
  'GET /receipts/{sha256}': ok(RECEIPT_IMAGE),
  'GET /receipts/{sha256}/thumbnail': ok(RECEIPT_IMAGE),

  // ── Sources ──────────────────────────────────────────────────────────────
  'GET /sources': ok({ items: [] }),
  'GET /sources/{id}': ok(SOURCE),
  'PUT /sources/{id}': ok(SOURCE),
  'DELETE /sources/{id}': acknowledged,

  // ── Search ───────────────────────────────────────────────────────────────
  'POST /search': ok({ hits: [] }),
};
