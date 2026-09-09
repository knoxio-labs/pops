import { MERCHANT_SPEND } from '../fixtures/merchant-spend';
import { ORDER, ORDER_ID } from '../fixtures/order';
import { ORDER_INDEX_ROW } from '../fixtures/order-index';
import { PRODUCT_DICTIONARY } from '../fixtures/product-dictionary';
import { RECONCILE_QUEUE } from '../fixtures/reconcile-queue';

import type { MockHandler } from './install';
import type { OperationKey } from './router';

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
  (body: unknown): MockHandler =>
  () => ({ body });

/** `{ ok: true }`, the contract's answer for a write with nothing to report. */
const acknowledged: MockHandler = () => ({ body: { ok: true } });

export const handlers: Readonly<Record<OperationKey, MockHandler>> = {
  // ── Reconcile ────────────────────────────────────────────────────────────
  'GET /reconcile/queue': ok(RECONCILE_QUEUE),
  'GET /reconcile/links': ok({ purchases: [] }),
  'POST /reconcile/links/batch': ok({ purchases: [] }),
  'POST /reconcile/confirm': acknowledged,
  'POST /reconcile/unlink': acknowledged,
  'POST /reconcile/reject': acknowledged,
  'POST /reconcile/sweep': ok({
    kind: 'swept',
    chargesConsidered: RECONCILE_QUEUE.items.length,
    derivedChargesMinted: 0,
    linksTornDown: 0,
    linksWritten: 0,
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
  'POST /purchases': ok(ORDER),
  'DELETE /purchases/{id}': acknowledged,
  'PATCH /purchases/{id}/items/{itemId}': ok(ORDER),
  'POST /purchases/{id}/documents': ok(ORDER),
  'GET /purchases/{id}/inventory-proposals': ok({ proposals: [] }),
  'POST /purchases/{id}/items/{itemId}/inventory-item': acknowledged,
  'POST /purchases/{id}/items/{itemId}/inventory-proposal': acknowledged,
  'GET /items': ok({ items: [] }),

  // ── Products ─────────────────────────────────────────────────────────────
  'GET /products': ok(PRODUCT_DICTIONARY),
  'PATCH /products/{productId}': acknowledged,
  'DELETE /products/{productId}': acknowledged,
  'PATCH /products/aliases/{aliasId}': acknowledged,
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
  'GET /analytics/product-leaderboard': ok({
    minOrderCount: 1,
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
  'GET /receipts/{sha256}': ok({ contentType: 'image/jpeg', data: '', sha256: '' }),
  'GET /receipts/{sha256}/thumbnail': ok({ contentType: 'image/jpeg', data: '', sha256: '' }),

  // ── Sources ──────────────────────────────────────────────────────────────
  'GET /sources': ok({ items: [] }),
  'GET /sources/{id}': ok({
    autoLinkPolicy: 'review',
    createdAt: '2026-07-02T10:00:00.000Z',
    descriptorPattern: null,
    id: 'hardware-barn',
    ingestAdapter: null,
    label: 'Hardware Barn',
    settlementWindowDays: 7,
  }),
  'PUT /sources/{id}': acknowledged,
  'DELETE /sources/{id}': acknowledged,

  // ── Search ───────────────────────────────────────────────────────────────
  'POST /search': ok({ hits: [] }),
};
