/**
 * Purchases tools — the assistant's read path onto line-item spend.
 *
 * Read-only, deliberately. Every write on this pillar is an ingest or a
 * classification decision: `POST /purchases` takes a checksum only an adapter
 * can compute, and `PATCH .../items/:itemId` is the one place a machine
 * proposal becomes a human assertion. A tool that let a model confirm a kind
 * would erase the distinction `kindConfirmedAt` exists to hold.
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
import { mapCallResult, optNum, optStr, reqStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

/**
 * The order lifecycle vocabulary, copied from
 * `pillars/purchases/src/contract/constants.ts`.
 *
 * Copied rather than imported: every tool module here restates its pillar's
 * shapes, because a `@pops/<pillar>` dependency on this package would have to
 * be COPYed into the MCP image and only the Docker build would say so.
 *
 * It advertises the vocabulary to the model and gates nothing. A status this
 * list has not caught up with is still forwarded, and the pillar's own
 * contract answers with a 400 — see {@link scopeFrom}.
 */
export const PURCHASE_STATUSES = [
  'awaiting_settlement',
  'linked',
  'partial',
  'settled_cash',
  'ignored',
] as const;

type ListPurchasesInput = {
  sources?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type MerchantSpendInput = {
  sources?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
};

type SearchInput = {
  query: { text: string };
};

type PurchasesShape = {
  purchase: {
    list: (input: ListPurchasesInput) => unknown;
    get: (input: { id: string }) => unknown;
    itemsByTag: (input: { tag: string; limit?: number }) => unknown;
  };
  analytics: {
    merchantSpend: (input: MerchantSpendInput) => unknown;
  };
  search: {
    search: (input: SearchInput) => unknown;
  };
};

function purchases(): PillarHandle<PurchasesShape> {
  return getPillar<PurchasesShape>('purchases');
}

/**
 * Repeated query parameters arrive as an array or not at all. A single
 * string is lifted so `{ sources: 'amazon' }` behaves the way a model will
 * assume it does, and anything that is not a string is dropped rather than
 * stringified into a filter nothing matches.
 */
function stringList(args: Record<string, unknown>, key: string): string[] | undefined {
  const raw = args[key];
  if (typeof raw === 'string') return [raw];
  if (!Array.isArray(raw)) return undefined;
  const values = raw.filter((v): v is string => typeof v === 'string');
  return values.length > 0 ? values : undefined;
}

const SCOPE_PROPERTIES = {
  sources: {
    type: 'array',
    items: { type: 'string' },
    description: 'Filter by ingest source id (e.g. "amazon", "woolworths")',
  },
  statuses: {
    type: 'array',
    items: { type: 'string', enum: PURCHASE_STATUSES },
    description: 'Filter by settlement status',
  },
  from: { type: 'string', description: 'Earliest order date, inclusive (ISO 8601)' },
  to: { type: 'string', description: 'Latest order date, inclusive (ISO 8601)' },
} as const;

function scopeFrom(args: Record<string, unknown>): MerchantSpendInput {
  const scope: MerchantSpendInput = {};
  const sources = stringList(args, 'sources');
  if (sources !== undefined) scope.sources = sources;
  // Passed through unfiltered on purpose. Dropping a status this list does
  // not know about would widen the scope silently — a caller asking for one
  // status would get every order and nothing would say so. The pillar's
  // contract rejects an unknown value with a 400, which is legible.
  const statuses = stringList(args, 'statuses');
  if (statuses !== undefined) scope.statuses = statuses;
  const from = optStr(args, 'from');
  if (from !== undefined) scope.from = from;
  const to = optStr(args, 'to');
  if (to !== undefined) scope.to = to;
  return scope;
}

const ordersList: ToolDef = {
  name: 'purchases.orders.list',
  description:
    'List purchase orders, newest first. An order is what a merchant sold — distinct from the bank transaction that paid for it. Filter by source, settlement status or order date.',
  inputSchema: {
    type: 'object',
    properties: {
      ...SCOPE_PROPERTIES,
      limit: { type: 'number', description: 'Max results, 1-500 (default 50)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },
  handler: async (args) => {
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
    'Search orders and line items by free text. Matches a merchant name or order id on the order side, and a product name or SKU on the line side — this is how to answer "which order had X in it". Every line-item hit carries the id of the order it belongs to.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Search query text' } },
    required: ['text'],
  },
  handler: async (args) => {
    const text = reqStr(args, 'text');
    if (!text) return toolError('Missing required field: text');
    return mapCallResult(await purchases().search.search({ query: { text } }));
  },
};

const itemsByTag: ToolDef = {
  name: 'purchases.items.byTag',
  description:
    "Every line item carrying a POPS item tag, across every order. Each hit reports the tag's own confirmedAt beside the line: null means a classification pass proposed the tag and it may be reconsidered, non-null means a human asserted it. Do not treat the two as the same evidence.",
  inputSchema: {
    type: 'object',
    properties: {
      tag: { type: 'string', description: 'Item tag slug, lower-case (e.g. "snack")' },
      limit: { type: 'number', description: 'Max results, 1-500' },
    },
    required: ['tag'],
  },
  handler: async (args) => {
    const tag = reqStr(args, 'tag');
    if (!tag) return toolError('Missing required field: tag');
    const limit = optNum(args, 'limit');
    return mapCallResult(
      await purchases().purchase.itemsByTag(limit === undefined ? { tag } : { tag, limit })
    );
  },
};

const merchantSpend: ToolDef = {
  name: 'purchases.analytics.merchantSpend',
  description:
    'Spend per merchant and currency over a period, with the explained/unexplained split. Groups are keyed on merchant AND currency and there is no cross-currency total, because no such number exists. `residualCents` is spend nothing accounts for — report it rather than dropping it. Takes no limit: the period is the only bound.',
  inputSchema: {
    type: 'object',
    properties: { ...SCOPE_PROPERTIES },
  },
  handler: async (args) =>
    mapCallResult(await purchases().analytics.merchantSpend(scopeFrom(args))),
};

export const purchasesTools: readonly ToolDef[] = [
  ordersList,
  ordersGet,
  search,
  itemsByTag,
  merchantSpend,
];
