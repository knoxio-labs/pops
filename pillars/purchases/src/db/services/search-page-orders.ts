import { and, count, inArray, sql } from 'drizzle-orm';

import { purchaseItemTags, purchaseItems, purchases } from '../schema.js';
import { purchaseFilterConditions } from './purchase-reads.js';
import { orderCandidate, type OrderRow } from './search-order-adapter.js';
import {
  afterSearchCursor,
  searchRankOrderBy,
  searchTextRank,
  type SearchPageCandidate,
  type SearchPageCursor,
  type SearchPageRequest,
  type SearchTextRank,
} from './search-page-query.js';

import type { SQL } from 'drizzle-orm';

import type { PurchasesDb } from './internal.js';
import type { PurchaseSearchScope } from './search-filters.js';

export interface OrderSearchPageCandidates {
  readonly candidates: readonly SearchPageCandidate[];
  readonly rowsRead: number;
  readonly totalCount: number;
}

interface OrderPageRow extends OrderRow {
  readonly dateRank: number | null;
}

interface OrderPageRead {
  readonly conditions: readonly SQL[];
  readonly rank: SearchTextRank;
  readonly cursor: SearchPageCursor | null;
  readonly limit: number;
  readonly uri: SQL<string>;
  readonly dateRank: SQL<number | null>;
}

function orderSearchConditions(db: PurchasesDb, scope: PurchaseSearchScope, matches: SQL): SQL[] {
  const conditions = [matches, ...purchaseFilterConditions(db, scope)];
  if (scope.tags !== undefined && scope.tags.length > 0) {
    const taggedPurchases = db
      .select({ purchaseId: purchaseItems.purchaseId })
      .from(purchaseItems)
      .innerJoin(purchaseItemTags, sql`${purchaseItemTags.itemId} = ${purchaseItems.id}`)
      .where(inArray(purchaseItemTags.tag, [...scope.tags]));
    conditions.push(inArray(purchases.id, taggedPurchases));
  }
  return conditions;
}

function countOrderCandidates(db: PurchasesDb, conditions: readonly SQL[]): number {
  return (
    db
      .select({ total: count() })
      .from(purchases)
      .where(and(...conditions))
      .get()?.total ?? 0
  );
}

function readOrderPageRows(db: PurchasesDb, request: OrderPageRead): OrderPageRow[] {
  const continuation = afterSearchCursor({
    adapter: 'purchases',
    score: request.rank.score,
    dateRank: request.dateRank,
    uri: request.uri,
    cursor: request.cursor,
  });
  const conditions =
    continuation === undefined ? request.conditions : [...request.conditions, continuation];
  return db
    .select({
      id: purchases.id,
      source: purchases.source,
      sourceOrderId: purchases.sourceOrderId,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
      orderedAt: purchases.orderedAt,
      orderedAtOffsetMinutes: purchases.orderedAtOffsetMinutes,
      currency: purchases.currency,
      totalCents: purchases.totalCents,
      status: purchases.status,
      dateRank: request.dateRank,
    })
    .from(purchases)
    .where(and(...conditions))
    .orderBy(...searchRankOrderBy(request.rank.score, request.dateRank, request.uri))
    .limit(request.limit + 1)
    .all();
}

function scoreOrderPageRows(rows: readonly OrderPageRow[], text: string): SearchPageCandidate[] {
  const candidates: SearchPageCandidate[] = [];
  for (const row of rows) {
    const { dateRank, ...order } = row;
    const candidate = orderCandidate(order satisfies OrderRow, text);
    if (candidate !== null) {
      candidates.push({ adapter: 'purchases', candidate, dateRank });
    }
  }
  return candidates;
}

/** Read only the first ranked order candidates needed for one search page. */
export function searchOrderPageCandidates(
  db: PurchasesDb,
  request: SearchPageRequest
): OrderSearchPageCandidates {
  const { text, scope, cursor, limit } = request;
  const rank = searchTextRank(
    [purchases.merchantEntityName, purchases.sourceOrderId, purchases.source].map((value) => ({
      value,
    })),
    text
  );
  const uri = sql<string>`'pops:purchases/purchase/' || ${purchases.id}`;
  const dateRank = sql<number | null>`julianday(${purchases.orderedAt})`;
  const conditions = orderSearchConditions(db, scope, rank.matches);
  const totalCount = countOrderCandidates(db, conditions);
  const rows = readOrderPageRows(db, { conditions, rank, cursor, limit, uri, dateRank });

  return {
    candidates: scoreOrderPageRows(rows, text),
    rowsRead: rows.length,
    totalCount,
  };
}
