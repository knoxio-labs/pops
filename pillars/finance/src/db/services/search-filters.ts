/**
 * `POST /search`'s structured filters, read as a per-adapter scope.
 *
 * Unlike purchases, finance's three adapters — transactions, budgets,
 * wishlist — are not two views of one entity sharing a single scope;
 * they are three unrelated domains with no columns in common. So a filter
 * narrows exactly the one adapter its field belongs to, and the other two are
 * unaffected by it — the same way `GET /budgets` takes no `type` param and
 * that is not `GET /budgets` "ignoring" a transaction concept.
 *
 * The contract closes the field and operator vocabularies, so the shapes
 * that reach here are already the supported ones. Two things it cannot
 * close remain, and both are refusals rather than adjustments:
 *
 * - **which operator a field takes.** `type gte` and `date eq` are
 *   well-formed and meaningless, and a schema cannot say so without turning
 *   one filter type into several.
 * - **whether the value is one.** `type eq shipped` names nothing in
 *   {@link TRANSACTION_TYPES}; `date gte yesterday` names nothing. Both would
 *   match no row, and returning zero hits for them is precisely the answer a
 *   caller cannot tell from a filter that worked.
 *
 * A repeated `eq` filter on the same field is a conflict, not a widening —
 * unlike purchases' `source`, none of these fields denote a caller-meant "any
 * of these": `type` and `priority` name one value per row, `entityId` and
 * `period` identify one thing. Two different values can only ever match
 * nothing, so it is refused rather than silently resolved either direction.
 * A repeated `date` bound keeps the tightest, which is what the conjunction
 * of two bounds on one field already means.
 */
import { TRANSACTION_TYPES, type TransactionType } from '../../contract/corrections-constants.js';
import { WISH_LIST_PRIORITIES, type WishListPriority } from './wishlist.js';

import type { SearchFilterField, SearchFilterOperator } from '../../contract/rest-search.js';

export interface SearchFilter {
  readonly field: SearchFilterField;
  readonly operator: SearchFilterOperator;
  readonly value: string;
}

export interface TransactionsSearchScope {
  readonly type?: TransactionType;
  readonly entityId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface BudgetsSearchScope {
  readonly period?: string;
  readonly active?: boolean;
}

export interface WishlistSearchScope {
  readonly priority?: WishListPriority;
}

export interface FinanceSearchScope {
  readonly transactions: TransactionsSearchScope;
  readonly budgets: BudgetsSearchScope;
  readonly wishlist: WishlistSearchScope;
}

/**
 * A scope, or the reason no scope could be made of the filters. Never a
 * scope with the unreadable filter dropped: a dropped filter is the defect,
 * not the fix.
 */
export type SearchScopeResult =
  | { readonly ok: true; readonly scope: FinanceSearchScope }
  | { readonly ok: false; readonly message: string };

const OPERATORS_BY_FIELD: Readonly<Record<SearchFilterField, readonly SearchFilterOperator[]>> = {
  type: ['eq'],
  entityId: ['eq'],
  date: ['gte', 'lte'],
  period: ['eq'],
  active: ['eq'],
  priority: ['eq'],
};

/** `transactions.date` is stored `YYYY-MM-DD` (see `transactions-list.ts`). */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Mutable while the list is read; the result is the immutable scope. */
interface ScopeUnderConstruction {
  type: TransactionType | undefined;
  entityId: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
  period: string | undefined;
  active: boolean | undefined;
  priority: WishListPriority | undefined;
}

/** The reason a filter could not be applied, or null when it was. */
type Refusal = string | null;

function unsupportedPairing(filter: SearchFilter): Refusal {
  const supported = OPERATORS_BY_FIELD[filter.field];
  if (supported.includes(filter.operator)) return null;
  return `Filter field '${filter.field}' does not support operator '${filter.operator}' (supported: ${supported.join(', ')})`;
}

function conflict(field: SearchFilterField, existing: string, incoming: string): Refusal {
  if (existing === incoming) return null;
  return `Filter field '${field}' was given conflicting values '${existing}' and '${incoming}'`;
}

function readType(scope: ScopeUnderConstruction, value: string): Refusal {
  if (!(TRANSACTION_TYPES as readonly string[]).includes(value)) {
    return `Filter value '${value}' is not a transaction type (one of: ${TRANSACTION_TYPES.join(', ')})`;
  }
  if (scope.type !== undefined) {
    const refusal = conflict('type', scope.type, value);
    if (refusal !== null) return refusal;
  }
  scope.type = value as TransactionType;
  return null;
}

function readEntityId(scope: ScopeUnderConstruction, value: string): Refusal {
  if (scope.entityId !== undefined) {
    const refusal = conflict('entityId', scope.entityId, value);
    if (refusal !== null) return refusal;
  }
  scope.entityId = value;
  return null;
}

function readDate(
  scope: ScopeUnderConstruction,
  operator: SearchFilterOperator,
  value: string
): Refusal {
  if (!DATE_ONLY.test(value)) {
    return `Filter value '${value}' is not a date in YYYY-MM-DD form`;
  }
  // Tightest bound wins, which is what the conjunction of two bounds on one
  // field already says.
  if (operator === 'gte' && (scope.startDate === undefined || value > scope.startDate)) {
    scope.startDate = value;
  }
  if (operator === 'lte' && (scope.endDate === undefined || value < scope.endDate)) {
    scope.endDate = value;
  }
  return null;
}

function readPeriod(scope: ScopeUnderConstruction, value: string): Refusal {
  if (scope.period !== undefined) {
    const refusal = conflict('period', scope.period, value);
    if (refusal !== null) return refusal;
  }
  scope.period = value;
  return null;
}

function readActive(scope: ScopeUnderConstruction, value: string): Refusal {
  if (value !== 'true' && value !== 'false') {
    return `Filter value '${value}' is not 'true' or 'false'`;
  }
  const parsed = value === 'true';
  if (scope.active !== undefined && scope.active !== parsed) {
    return `Filter field 'active' was given conflicting values '${String(scope.active)}' and '${value}'`;
  }
  scope.active = parsed;
  return null;
}

function readPriority(scope: ScopeUnderConstruction, value: string): Refusal {
  if (!(WISH_LIST_PRIORITIES as readonly string[]).includes(value)) {
    return `Filter value '${value}' is not a wish-list priority (one of: ${WISH_LIST_PRIORITIES.join(', ')})`;
  }
  if (scope.priority !== undefined) {
    const refusal = conflict('priority', scope.priority, value);
    if (refusal !== null) return refusal;
  }
  scope.priority = value as WishListPriority;
  return null;
}

function readFilter(scope: ScopeUnderConstruction, filter: SearchFilter): Refusal {
  const pairing = unsupportedPairing(filter);
  if (pairing !== null) return pairing;

  switch (filter.field) {
    case 'type':
      return readType(scope, filter.value);
    case 'entityId':
      return readEntityId(scope, filter.value);
    case 'date':
      return readDate(scope, filter.operator, filter.value);
    case 'period':
      return readPeriod(scope, filter.value);
    case 'active':
      return readActive(scope, filter.value);
    case 'priority':
      return readPriority(scope, filter.value);
  }
}

/**
 * The per-adapter scope a filter list denotes, or a message naming what
 * could not be applied.
 *
 * An empty list is a scope over everything, which is what a caller sending
 * `filters: []` means and is indistinguishable from sending none.
 */
export function searchFilterScope(filters: readonly SearchFilter[]): SearchScopeResult {
  const scope: ScopeUnderConstruction = {
    type: undefined,
    entityId: undefined,
    startDate: undefined,
    endDate: undefined,
    period: undefined,
    active: undefined,
    priority: undefined,
  };

  for (const filter of filters) {
    const refusal = readFilter(scope, filter);
    if (refusal !== null) return { ok: false, message: refusal };
  }

  return {
    ok: true,
    scope: {
      transactions: {
        ...(scope.type === undefined ? {} : { type: scope.type }),
        ...(scope.entityId === undefined ? {} : { entityId: scope.entityId }),
        ...(scope.startDate === undefined ? {} : { startDate: scope.startDate }),
        ...(scope.endDate === undefined ? {} : { endDate: scope.endDate }),
      },
      budgets: {
        ...(scope.period === undefined ? {} : { period: scope.period }),
        ...(scope.active === undefined ? {} : { active: scope.active }),
      },
      wishlist: {
        ...(scope.priority === undefined ? {} : { priority: scope.priority }),
      },
    },
  };
}
