import { ENTITY_PURCHASES, LINKED_TRANSACTION_ID } from '../fixtures/purchases';
import { acknowledged, notFound, ok } from './respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AnalyticsMerchantSpendResponses,
  AnalyticsProductLeaderboardResponses,
  PurchaseCreateResponses,
  PurchaseGetResponses,
  PurchaseListResponses,
  ReceiptExtractResponses,
  ReceiptUploadResponses,
  ReconcileLinksBatchResponses,
  ReconcileLinksResponses,
  ReconcileSweepResponses,
  SourceUpsertResponses,
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

/**
 * The one purchase finance knows of, as a whole order with no lines, charges
 * or shipments: the answer the creating operations owe, since finance never
 * creates a purchase and has no richer fixture to hand back.
 */
function orderOf(row: PurchaseListResponses[200]['items'][number]): PurchaseGetResponses[200] {
  const { itemCount: _itemCount, receiptUri: _receiptUri, ...purchase } = row;
  return {
    accounting: {
      awaitingImportCents: 0,
      matchedCents: row.totalCents,
      netSpendCents: row.totalCents,
      refundedCents: 0,
      residualCents: 0,
      totalCents: row.totalCents,
    },
    charges: [],
    documents: [],
    edit: null,
    items: [],
    purchase,
    shipments: [],
    tags: [],
  };
}

const orderCreated: MockHandler = () => {
  const [row] = ENTITY_PURCHASES;
  if (row === undefined) return notFound('purchase');
  const body: PurchaseCreateResponses[201] = orderOf(row);
  return { status: 201, body };
};

const orderSaved: MockHandler = () => {
  const [row] = ENTITY_PURCHASES;
  if (row === undefined) return notFound('purchase');
  return { body: orderOf(row) };
};

const unreadable: ReceiptUploadResponses[200] & ReceiptExtractResponses[200] = {
  kind: 'unreadable',
  reason: 'The standalone harness does not read receipts.',
  receiptUris: [`pops://purchases/receipt/${'0'.repeat(64)}`],
};

const sourceUpserted: MockHandler = ({ params }) => {
  const body: SourceUpsertResponses[200] = {
    autoLinkPolicy: 'review',
    createdAt: '2026-09-05T08:00:00.000Z',
    descriptorPattern: null,
    id: params['id'] ?? 'source',
    ingestAdapter: null,
    label: params['id'] ?? 'source',
    settlementWindowDays: 7,
  };
  return { body };
};

const allTime = { from: null, to: null };

export const purchasesHandlers: MockHandlers = {
  'GET /purchases': listPurchases,
  'POST /purchases': orderCreated,
  'POST /purchases/manual': orderSaved,
  'GET /purchases/{id}': () => notFound('purchase'),
  'PATCH /purchases/{id}': () => notFound('purchase'),
  'DELETE /purchases/{id}': acknowledged,
  'DELETE /purchases/{id}/capture/location': acknowledged,
  'POST /purchases/{id}/documents': () => notFound('purchase'),
  'GET /purchases/{id}/inventory-proposals': ok({ proposals: [] }),
  'PATCH /purchases/{id}/items/{itemId}': () => notFound('purchase'),
  'POST /purchases/{id}/items/{itemId}/inventory-item': () => notFound('purchase'),
  'POST /purchases/{id}/items/{itemId}/inventory-proposal': () => notFound('purchase'),
  'GET /items': ok({ items: [], pagination: { total: 0, limit: 50, offset: 0, hasMore: false } }),
  'GET /items/tags': ok({ tags: [] }),

  'GET /reconcile/queue': ok({ items: [] }),
  'GET /reconcile/links': linksFor,
  'POST /reconcile/links/batch': linkSummaries,
  'POST /reconcile/confirm': ok({ ok: true, matchRuleId: null }),
  'POST /reconcile/unlink': acknowledged,
  'POST /reconcile/reject': acknowledged,
  'POST /reconcile/sweep': ok<ReconcileSweepResponses[200]>({
    kind: 'skipped',
    reason: 'The standalone harness does not sweep.',
  }),

  'GET /products': ok({ products: [] }),
  'PATCH /products/{productId}': () => notFound('product'),
  'DELETE /products/{productId}': acknowledged,
  'PATCH /products/aliases/{aliasId}': () => notFound('alias'),
  'DELETE /products/aliases/{aliasId}': acknowledged,
  'POST /products/proposals': ok({
    confirmed: 0,
    observedWordings: 0,
    proposed: 0,
    retired: 0,
    scannedLines: 0,
  }),

  'GET /analytics/merchant-spend': ok<AnalyticsMerchantSpendResponses[200]>({
    merchants: [],
    period: allTime,
    totals: [],
  }),
  'GET /analytics/month-summary': ok({
    month: '2026-09',
    totals: [],
    purchaseCount: 0,
    previousMonthTotals: null,
    unmatchedCount: 0,
    merchantLeaders: [],
  }),
  'GET /analytics/product-leaderboard': ok<AnalyticsProductLeaderboardResponses[200]>({
    minOrderCount: 1,
    period: allTime,
    products: [],
    coverage: {
      confirmedProductLines: 0,
      lineCount: 0,
      nameKeyedLines: 0,
      productCount: 0,
      proposedProductLines: 0,
      skuKeyedLines: 0,
      unidentifiedLines: 0,
    },
  }),

  'POST /receipts': ok(unreadable),
  'POST /receipts/extract': ok(unreadable),
  'POST /receipts/draft': orderSaved,
  'GET /receipts/{sha256}': () => notFound('receipt'),
  'GET /receipts/{sha256}/thumbnail': () => notFound('receipt'),

  'GET /sources': ok({ items: [] }),
  'GET /sources/{id}': () => notFound('source'),
  'PUT /sources/{id}': sourceUpserted,
  'DELETE /sources/{id}': acknowledged,

  'POST /search': ok({ hits: [] }),
};
