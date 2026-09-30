import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { purchaseItemTags, purchaseItems, purchases } from '../schema.js';
import { purchaseFilterConditions } from './purchase-reads.js';
import { itemCandidate, type ItemRow } from './search-item-adapter.js';
import {
  afterSearchCursor,
  searchRankOrderBy,
  searchTextRank,
  type SearchPageCandidate,
  type SearchPageCursor,
  type SearchPageRequest,
  type SearchTextRank,
} from './search-page-query.js';
import { containsLiteralInsensitive } from './search-text.js';

import type { SQL, SQLWrapper } from 'drizzle-orm';

import type { PurchasesDb } from './internal.js';
import type { PurchaseSearchScope } from './search-filters.js';

export interface LineSearchPageCandidates {
  readonly candidates: readonly SearchPageCandidate[];
  readonly rowsRead: number;
  readonly totalCount: number;
}

interface LinePageRow extends ItemRow {
  readonly matchedTag: string | null;
  readonly dateRank: number | null;
}

interface LinePageRead {
  readonly conditions: readonly SQL[];
  readonly rank: SearchTextRank;
  readonly cursor: SearchPageCursor | null;
  readonly limit: number;
  readonly uri: SQL<string>;
  readonly dateRank: SQL<number | null>;
  readonly matchedTag: SQL<string | null>;
}

function matchingTag(itemId: SQLWrapper, text: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT MIN(${purchaseItemTags.tag})
    FROM ${purchaseItemTags}
    WHERE ${purchaseItemTags.itemId} = ${itemId}
      AND ${containsLiteralInsensitive(purchaseItemTags.tag, text)}
  )`;
}

function lineSearchConditions(db: PurchasesDb, scope: PurchaseSearchScope, matches: SQL): SQL[] {
  const conditions = [matches, ...purchaseFilterConditions(db, scope)];
  if (scope.tags !== undefined && scope.tags.length > 0) {
    const taggedItems = db
      .select({ itemId: purchaseItemTags.itemId })
      .from(purchaseItemTags)
      .where(inArray(purchaseItemTags.tag, [...scope.tags]));
    conditions.push(inArray(purchaseItems.id, taggedItems));
  }
  return conditions;
}

function countLineCandidates(db: PurchasesDb, conditions: readonly SQL[]): number {
  return (
    db
      .select({ total: count() })
      .from(purchaseItems)
      .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
      .where(and(...conditions))
      .get()?.total ?? 0
  );
}

function readLinePageRows(db: PurchasesDb, request: LinePageRead): LinePageRow[] {
  const continuation = afterSearchCursor({
    adapter: 'lines',
    score: request.rank.score,
    dateRank: request.dateRank,
    uri: request.uri,
    cursor: request.cursor,
  });
  const conditions =
    continuation === undefined ? request.conditions : [...request.conditions, continuation];
  return db
    .select({
      id: purchaseItems.id,
      purchaseId: purchaseItems.purchaseId,
      name: purchaseItems.name,
      sku: purchaseItems.sku,
      skuScheme: purchaseItems.skuScheme,
      quantity: purchaseItems.quantity,
      lineTotalCents: purchaseItems.lineTotalCents,
      refundedCents: purchaseItems.refundedCents,
      orderedAt: purchases.orderedAt,
      orderedAtOffsetMinutes: purchases.orderedAtOffsetMinutes,
      currency: purchases.currency,
      merchantEntityName: purchases.merchantEntityName,
      status: purchases.status,
      totalCents: purchases.totalCents,
      matchedTag: request.matchedTag,
      dateRank: request.dateRank,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .where(and(...conditions))
    .orderBy(...searchRankOrderBy(request.rank.score, request.dateRank, request.uri))
    .limit(request.limit + 1)
    .all();
}

function scoreLinePageRows(rows: readonly LinePageRow[], text: string): SearchPageCandidate[] {
  const candidates: SearchPageCandidate[] = [];
  for (const row of rows) {
    const { matchedTag: rowTag, dateRank, ...item } = row;
    const tags = rowTag === null ? new Map<string, string>() : new Map([[item.id, rowTag]]);
    const candidate = itemCandidate(item satisfies ItemRow, text, tags);
    if (candidate !== null) {
      candidates.push({ adapter: 'lines', candidate, dateRank });
    }
  }
  return candidates;
}

/** Read only the first ranked line candidates needed for one search page. */
export function searchLinePageCandidates(
  db: PurchasesDb,
  request: SearchPageRequest
): LineSearchPageCandidates {
  const { text, scope, cursor, limit } = request;
  const tag = matchingTag(purchaseItems.id, text);
  const rank = searchTextRank(
    [purchaseItems.name, purchaseItems.sku, tag].map((value) => ({ value })),
    text
  );
  const uri = sql<string>`'pops:purchases/purchase-item/' || ${purchaseItems.id}`;
  const dateRank = sql<number | null>`julianday(${purchases.orderedAt})`;
  const conditions = lineSearchConditions(db, scope, rank.matches);
  const totalCount = countLineCandidates(db, conditions);
  const rows = readLinePageRows(db, {
    conditions,
    rank,
    cursor,
    limit,
    uri,
    dateRank,
    matchedTag: tag,
  });

  return {
    candidates: scoreLinePageRows(rows, text),
    rowsRead: rows.length,
    totalCount,
  };
}
