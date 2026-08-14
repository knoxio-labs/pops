/**
 * Handler for the `search.*` sub-router — finance's slice of unified search.
 *
 * Aggregates three finance adapters, each a `LIKE` candidate scan ranked by
 * exact/prefix/contains scoring against the finance pillar's `FinanceDb`:
 *   - transactions
 *   - budgets (capped at BUDGETS_DEFAULT_LIMIT)
 *   - wishlist
 * Hits from all three are concatenated into one response.
 *
 * `query.filters` is read into a per-adapter scope by `searchFilterScope` and
 * narrows the SQL each adapter scans, before the text match/ranking runs —
 * the same order purchases narrows in — so an excluded row cannot occupy a
 * slot in a capped adapter (`BUDGETS_DEFAULT_LIMIT`) that a caller asked not
 * to see. An unreadable filter refuses the whole request (`ValidationError`
 * → 400) rather than dropping it: a silently dropped filter looks identical
 * to a filter that matched everything, which is the defect this exists to
 * fix.
 *
 * `uri` shapes are a cross-pillar contract: the search orchestrator dispatches
 * on them and caches client links keyed by them, so they must stay stable.
 */
import { and, eq, gte, like, lte, sql } from 'drizzle-orm';

import {
  budgets,
  type BudgetsSearchScope,
  type FinanceDb,
  searchFilterScope,
  transactions,
  type TransactionsSearchScope,
  wishList,
  type WishlistSearchScope,
} from '../../db/index.js';
import { centsToDollars, centsToDollarsNullable } from '../../money.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeSearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof financeSearchContract>;

type MatchType = 'exact' | 'prefix' | 'contains';

interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: MatchType;
  data: Record<string, unknown>;
}

const BUDGETS_DEFAULT_LIMIT = 20;

function classify(
  value: string,
  queryText: string
): { score: number; matchType: MatchType } | null {
  const lower = value.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

function searchTransactions(
  db: FinanceDb,
  text: string,
  scope: TransactionsSearchScope
): SearchHit[] {
  const conditions = [like(sql`lower(${transactions.description})`, `%${text.toLowerCase()}%`)];
  if (scope.type !== undefined) conditions.push(eq(transactions.type, scope.type));
  if (scope.entityId !== undefined) conditions.push(eq(transactions.entityId, scope.entityId));
  if (scope.startDate !== undefined) conditions.push(gte(transactions.date, scope.startDate));
  if (scope.endDate !== undefined) conditions.push(lte(transactions.date, scope.endDate));

  const rows = db
    .select({
      id: transactions.id,
      description: transactions.description,
      amountCents: transactions.amountCents,
      date: transactions.date,
      entityName: transactions.entityName,
      type: transactions.type,
    })
    .from(transactions)
    .where(and(...conditions))
    .all();

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const match = classify(row.description, text);
    if (!match) continue;

    hits.push({
      uri: `pops:finance/transaction/${row.id}`,
      score: match.score,
      matchField: 'description',
      matchType: match.matchType,
      data: {
        description: row.description,
        amount: centsToDollars(row.amountCents),
        date: row.date,
        entityName: row.entityName,
        type: row.type.toLowerCase(),
      },
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function searchBudgets(db: FinanceDb, text: string, scope: BudgetsSearchScope): SearchHit[] {
  const conditions = [like(budgets.category, `%${text}%`)];
  if (scope.period !== undefined) conditions.push(eq(budgets.period, scope.period));
  if (scope.active !== undefined) conditions.push(eq(budgets.active, scope.active ? 1 : 0));

  const rows = db
    .select()
    .from(budgets)
    .where(and(...conditions))
    .limit(BUDGETS_DEFAULT_LIMIT)
    .all();

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const match = classify(row.category, text);
    if (!match) continue;

    hits.push({
      uri: `/budgets/${row.id}`,
      score: match.score,
      matchField: 'category',
      matchType: match.matchType,
      data: {
        category: row.category,
        period: row.period,
        amount: centsToDollarsNullable(row.amountCents),
      },
    });
  }

  return hits.toSorted((a, b) => b.score - a.score);
}

function searchWishlist(db: FinanceDb, text: string, scope: WishlistSearchScope): SearchHit[] {
  const lowerText = text.toLowerCase();

  // Exclude already-purchased items (saved >= target_amount). Items with no
  // target_amount stay searchable since there is no completion threshold to
  // compare against. NULL `saved` is treated as 0 via COALESCE so a row with
  // a target but no recorded savings still counts as not-yet-purchased.
  const conditions = [
    like(sql`lower(${wishList.item})`, `%${lowerText}%`),
    sql`(${wishList.targetAmountCents} IS NULL OR coalesce(${wishList.savedCents}, 0) < ${wishList.targetAmountCents})`,
  ];
  if (scope.priority !== undefined) conditions.push(eq(wishList.priority, scope.priority));

  const rows = db
    .select()
    .from(wishList)
    .where(and(...conditions))
    .all();

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const match = classify(row.item, text);
    if (!match) continue;

    hits.push({
      uri: `/finance/wishlist`,
      score: match.score,
      matchField: 'item',
      matchType: match.matchType,
      data: {
        item: row.item,
        priority: row.priority,
        targetAmount: centsToDollarsNullable(row.targetAmountCents),
      },
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

export function makeSearchHandlers(db: FinanceDb) {
  return {
    search: ({ body }: Req['search']) =>
      runHttp(() => {
        const filterResult = searchFilterScope(body.query.filters ?? []);
        if (!filterResult.ok) {
          throw new ValidationError({ filters: body.query.filters }, filterResult.message);
        }
        const { scope } = filterResult;

        const text = body.query.text.trim();
        if (!text) return { status: 200 as const, body: { hits: [] } };

        const hits: SearchHit[] = [
          ...searchTransactions(db, text, scope.transactions),
          ...searchBudgets(db, text, scope.budgets),
          ...searchWishlist(db, text, scope.wishlist),
        ];
        return { status: 200 as const, body: { hits } };
      }),
  };
}
