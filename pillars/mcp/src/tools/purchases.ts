/**
 * Purchases tools — the assistant's read path onto line-item spend.
 *
 * Read-only, with one exception. Every other write on this pillar is an
 * ingest or a classification decision: `POST /purchases` takes a checksum
 * only an adapter can compute, and `PATCH .../items/:itemId` is the one place
 * a machine proposal becomes a human assertion. A tool that let a model
 * confirm a kind would erase the distinction `kindConfirmedAt` exists to
 * hold. The exception is in `purchases-inventory-proposals.ts`.
 *
 * The pillar SDK addresses a route by its OpenAPI `operationId`
 * (`<domain>.<proc>`), so {@link PurchasesShape} mirrors `purchasesContract`'s
 * sub-routers rather than inventing a shape of its own.
 *
 * Note for whoever wires the service account: purchases admits an
 * uncredentialled caller but holds a caller that presents an `X-API-Key` to
 * that key's grant. MCP always presents one, so these tools need
 * `purchases.purchase`, `purchases.analytics` and `purchases.search` on the
 * MCP account or they return 403.
 */
import { getPillar } from '../pillar-client.js';
import { PURCHASE_SCOPE_PROPERTIES, purchaseScopeDateError } from './purchase-scope.js';
import { searchFiltersFrom } from './purchase-search-filters.js';
import { merchantSpend, productLeaderboard, scopeFrom } from './purchases-analytics.js';
import { inventoryProposalTools } from './purchases-inventory-proposals.js';
import { mapCallResult, optNum, reqStr, toolError } from './utils.js';

/** The order lifecycle vocabulary advertised by the purchases tools. */
export { PURCHASE_STATUSES } from './purchase-scope.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { PurchaseSearchFilter } from './purchase-search-filters.js';
import type { MerchantSpendInput, ProductLeaderboardInput } from './purchases-analytics.js';
import type { ToolDef } from './tool-def.js';

type ListPurchasesInput = {
  sources?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type SearchInput = {
  query: { text: string; filters?: PurchaseSearchFilter[] };
};

type PurchasesShape = {
  purchase: {
    list: (input: ListPurchasesInput) => unknown;
    get: (input: { id: string }) => unknown;
    itemsByTag: (input: { tag: string; limit?: number; offset?: number }) => unknown;
  };
  analytics: {
    merchantSpend: (input: MerchantSpendInput) => unknown;
    productLeaderboard: (input: ProductLeaderboardInput) => unknown;
  };
  search: {
    search: (input: SearchInput) => unknown;
  };
};

function purchases(): PillarHandle<PurchasesShape> {
  return getPillar<PurchasesShape>('purchases');
}

const ordersList: ToolDef = {
  name: 'purchases.orders.list',
  description:
    'List purchase orders, newest first. An order is what a merchant sold — distinct from the bank transaction that paid for it. Filter by source, settlement status or order date.',
  inputSchema: {
    type: 'object',
    properties: {
      ...PURCHASE_SCOPE_PROPERTIES,
      limit: { type: 'number', description: 'Max results, 1-500 (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
    const dateError = purchaseScopeDateError(args);
    if (dateError !== undefined) return toolError(dateError);

    const input: ListPurchasesInput = scopeFrom(args);
    const limit = optNum(args, 'limit');
    if (limit !== undefined) input.limit = limit;
    const offset = optNum(args, 'offset');
    if (offset !== undefined) input.offset = offset;
    return mapCallResult(await purchases().purchase.list(input));
  },
};

const ordersGet: ToolDef = {
  name: 'purchases.orders.get',
  description:
    "Get one order with its deliveries, line items, charges, documents and accounting split. The split reports how much of the order's total a finance transaction backs (matched), how much is charged but not yet imported (awaitingImport), and how much nothing explains (residual).",
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Order id' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await purchases().purchase.get({ id }));
  },
};

const search: ToolDef = {
  name: 'purchases.search',
  description:
    'Search orders and line items by free text, with optional source, settlement status and inclusive order-date filters. Matches a merchant name or order id on the order side, and a product name or SKU on the line side — this is how to answer "which order had X in it". Every line-item hit carries the id of the order it belongs to.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Search query text' },
      ...PURCHASE_SCOPE_PROPERTIES,
    },
    required: ['text'],
  },
  handler: async (args) => {
    const text = reqStr(args, 'text');
    if (!text) return toolError('Missing required field: text');
    const dateError = purchaseScopeDateError(args);
    if (dateError !== undefined) return toolError(dateError);

    const query: SearchInput['query'] = { text };
    const filters = searchFiltersFrom(scopeFrom(args));
    if (filters !== undefined) query.filters = filters;
    return mapCallResult(await purchases().search.search({ query }));
  },
};

const itemsByTag: ToolDef = {
  name: 'purchases.items.byTag',
  description:
    "Line items carrying a POPS item tag, across every order, newest first — one page at a time (max results, 1-500, default 200). The response's pagination.total is the true count for the tag; page with limit/offset to see the rest rather than reading the returned page as the whole set. Each hit reports the tag's own confirmedAt beside the line: null means a classification pass proposed the tag and it may be reconsidered, non-null means a human asserted it. Do not treat the two as the same evidence.",
  inputSchema: {
    type: 'object',
    properties: {
      tag: { type: 'string', description: 'Item tag slug, lower-case (e.g. "snack")' },
      limit: { type: 'number', description: 'Max results, 1-500 (default 200)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
    required: ['tag'],
  },
  handler: async (args) => {
    const tag = reqStr(args, 'tag');
    if (!tag) return toolError('Missing required field: tag');
    const input: { tag: string; limit?: number; offset?: number } = { tag };
    const limit = optNum(args, 'limit');
    if (limit !== undefined) input.limit = limit;
    const offset = optNum(args, 'offset');
    if (offset !== undefined) input.offset = offset;
    return mapCallResult(await purchases().purchase.itemsByTag(input));
  },
};

export const purchasesTools: readonly ToolDef[] = [
  ordersList,
  ordersGet,
  search,
  itemsByTag,
  merchantSpend,
  productLeaderboard,
  ...inventoryProposalTools,
];
