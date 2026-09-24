import { ENTITY_PURCHASES, LINKED_TRANSACTION_ID } from '../fixtures/purchases';
import { acknowledged, created, notFound, ok } from './respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  PurchaseListResponses,
  ReconcileLinksBatchResponses,
  ReconcileLinksResponses,
} from '../../purchases-api/types.gen';

/**
 * The vendored purchases contract (`contracts/purchases.openapi.json`), served
 * under `/purchases-api`.
 *
 * Finance reads three of these: an entity's purchases, the per-transaction
 * link summaries behind the transactions table's purchase column, and one
 * transaction's links. Those answer from `../fixtures/purchases`; every other
 * operation answers the smallest body its contract admits, because finance
 * never calls it and the coverage test still owes it an answer.
 */

const LINKED_URI = `pops://finance/transaction/${LINKED_TRANSACTION_ID}`;

const listPurchases: MockHandler = ({ query }) => {
  const merchant = query.get('merchantEntityId');
  const items = ENTITY_PURCHASES.filter(
    (p) => merchant === null || p.merchantEntityId === merchant
  );
  const body: PurchaseListResponses[200] = { items, total: items.length };
  return { body };
};

const linkSummaries: MockHandler = ({ body }) => {
  const requested =
    typeof body === 'object' &&
    body !== null &&
    'transactionUris' in body &&
    Array.isArray(body.transactionUris)
      ? body.transactionUris.filter((uri): uri is string => typeof uri === 'string')
      : [];
  const answer: ReconcileLinksBatchResponses[200] = {
    transactions: requested.map((transactionUri) => ({
      transactionUri,
      purchaseCount: transactionUri === LINKED_URI ? 1 : 0,
      confirmedChargeCount: transactionUri === LINKED_URI ? 1 : 0,
      derivedChargeCount: 0,
    })),
  };
  return { body: answer };
};

const linksFor: MockHandler = ({ query }) => {
  const transactionUri = query.get('transactionUri') ?? '';
  const body: ReconcileLinksResponses[200] = { transactionUri, purchases: [] };
  return { body };
};

const emptyTotals = { totalCents: 0, orderCount: 0 };

export const purchasesHandlers: MockHandlers = {
  'GET /purchases': listPurchases,
  'POST /purchases': created({}),
  'POST /purchases/manual': ok({}),
  'GET /purchases/{id}': () => notFound('purchase'),
  'PATCH /purchases/{id}': ok({}),
  'DELETE /purchases/{id}': acknowledged,
  'DELETE /purchases/{id}/capture/location': acknowledged,
  'POST /purchases/{id}/documents': created({}),
  'GET /purchases/{id}/inventory-proposals': ok({ proposals: [] }),
  'PATCH /purchases/{id}/items/{itemId}': ok({}),
  'POST /purchases/{id}/items/{itemId}/inventory-item': created({}),
  'POST /purchases/{id}/items/{itemId}/inventory-proposal': ok({}),
  'GET /items': ok({ items: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } }),
  'GET /items/tags': ok({ tags: [] }),

  'GET /reconcile/queue': ok({ items: [] }),
  'GET /reconcile/links': linksFor,
  'POST /reconcile/links/batch': linkSummaries,
  'POST /reconcile/confirm': ok({ ok: true, matchRuleId: null }),
  'POST /reconcile/unlink': acknowledged,
  'POST /reconcile/reject': acknowledged,
  'POST /reconcile/sweep': ok({ kind: 'swept' }),

  'GET /products': ok({ products: [] }),
  'PATCH /products/{productId}': ok({}),
  'DELETE /products/{productId}': acknowledged,
  'PATCH /products/aliases/{aliasId}': ok({}),
  'DELETE /products/aliases/{aliasId}': acknowledged,
  'POST /products/proposals': ok({
    confirmed: 0,
    observedWordings: 0,
    proposed: 0,
    retired: 0,
    scannedLines: 0,
  }),

  'GET /analytics/merchant-spend': ok({ merchants: [], period: null, totals: [] }),
  'GET /analytics/month-summary': ok({
    month: '2026-09',
    totals: [],
    purchaseCount: 0,
    previousMonthTotals: null,
    unmatchedCount: 0,
    merchantLeaders: [],
  }),
  'GET /analytics/product-leaderboard': ok({
    minOrderCount: 1,
    period: null,
    products: [],
    coverage: emptyTotals,
  }),

  'POST /receipts': ok({}),
  'POST /receipts/extract': ok({}),
  'POST /receipts/draft': ok({}),
  'GET /receipts/{sha256}': () => notFound('receipt'),
  'GET /receipts/{sha256}/thumbnail': () => notFound('receipt'),

  'GET /sources': ok({ items: [] }),
  'GET /sources/{id}': () => notFound('source'),
  'PUT /sources/{id}': ok({}),
  'DELETE /sources/{id}': acknowledged,

  'POST /search': ok({ hits: [] }),
};
