/**
 * The read side of the transactions service: how the list is narrowed, and
 * the order it comes back in.
 *
 * Split out of `transactions.ts` (which keeps the writes) because the ordering
 * and the keyset anchor are one idea and have to be read together — the anchor
 * is only meaningful against the exact order `listTransactions` imposes, and a
 * change to one that is not made to the other silently pages past rows.
 */
import { and, count, desc, eq, gte, like, lt, lte, or, type SQL, sql } from 'drizzle-orm';

import { transactions } from '../schema.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { FinanceDb, TransactionRow } from './internal.js';

/** Filters accepted by {@link listTransactions}. */
export interface TransactionFilters {
  search?: string | undefined;
  accountId?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  tag?: string | undefined;
  entityId?: string | undefined;
  type?: TransactionType | undefined;
  /**
   * Keyset anchor: return only rows that sort strictly AFTER `(beforeDate,
   * beforeId)` under this service's total order. Both halves are required
   * together — a date alone cannot separate rows that share it, which is the
   * entire reason the anchor carries an id.
   */
  beforeDate?: string | undefined;
  beforeId?: string | undefined;
}

/** Count + rows for a paginated list. */
export interface TransactionListResult {
  rows: TransactionRow[];
  total: number;
}

function buildListConditions(filters: TransactionFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.search) {
    conditions.push(like(transactions.description, `%${filters.search}%`));
  }
  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.startDate) {
    conditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters.tag) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${transactions.tags}) WHERE json_each.value = ${filters.tag})`
    );
  }
  if (filters.entityId) {
    conditions.push(eq(transactions.entityId, filters.entityId));
  }
  if (filters.type) {
    conditions.push(eq(transactions.type, filters.type));
  }
  const keyset = buildKeysetCondition(filters.beforeDate, filters.beforeId);
  if (keyset !== undefined) {
    conditions.push(keyset);
  }
  return conditions;
}

/**
 * The lexicographic expansion of `(date, id) < (beforeDate, beforeId)` under
 * the `date DESC, id DESC` order {@link listTransactions} imposes.
 *
 * Written out rather than as a row-value comparison because drizzle has no
 * row-value builder — the two forms must stay provably the same predicate, so
 * it lives next to the ordering it mirrors. Returns `undefined` when the
 * anchor is absent or half-supplied; a lone date cannot separate rows that
 * share it, and honouring half an anchor would page past rows silently. The
 * REST layer rejects a half anchor outright rather than reaching this.
 */
function buildKeysetCondition(
  beforeDate: string | undefined,
  beforeId: string | undefined
): SQL | undefined {
  if (beforeDate === undefined || beforeId === undefined) return undefined;
  return or(
    lt(transactions.date, beforeDate),
    and(eq(transactions.date, beforeDate), lt(transactions.id, beforeId))
  );
}

/**
 * List transactions with optional filters. Sorted by date DESC, then id DESC.
 *
 * The `id` leg is not decoration. `date` is date-only (`YYYY-MM-DD`), so ties
 * are the norm rather than the exception, and SQLite is free to order a tie
 * group differently between two queries — which silently duplicates and drops
 * rows for anything paging this list. The tiebreak makes the order total, and
 * a total order is the precondition for the keyset filter above.
 *
 * `total` is the unpaginated count under the same filters, keyset included —
 * so under a keyset anchor it counts what remains, not the whole table.
 */
export function listTransactions(
  db: FinanceDb,
  filters: TransactionFilters,
  limit: number,
  offset: number
): TransactionListResult {
  const conditions = buildListConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit)
    .offset(offset)
    .all();
  const countRow = db.select({ total: count() }).from(transactions).where(where).all()[0];

  return { rows, total: countRow?.total ?? 0 };
}
