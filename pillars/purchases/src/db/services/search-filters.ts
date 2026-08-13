/**
 * `POST /search`'s structured filters, read as the order scope they denote.
 *
 * The contract closes the field and operator vocabularies, so the shapes
 * that reach here are already the supported ones. Two things it cannot
 * close remain, and both are refusals rather than adjustments:
 *
 * - **which operator a field takes.** `orderedAt eq` and `source gte` are
 *   well-formed and meaningless, and a schema cannot say so without turning
 *   one filter type into three.
 * - **whether the value is one.** `status eq shipped` names a shipment
 *   status, not an order's; `orderedAt gte yesterday` names nothing. Both
 *   would match no row, and returning zero hits for them is precisely the
 *   answer a caller cannot tell from a filter that worked.
 *
 * Translating to {@link PurchaseScopeFilter} rather than emitting SQL here
 * is what keeps search covering the same orders the index and the roll-up
 * cover for the same scope: they all narrow through
 * `purchaseFilterConditions`, so there is one description of which orders a
 * scope means.
 */
import { IsoTimestampSchema, PurchaseStatusSchema } from '../../contract/schemas/purchase.js';

import type { PurchaseStatus } from '../../contract/constants.js';
import type { SearchFilterField, SearchFilterOperator } from '../../contract/rest-search.js';
import type { PurchaseScopeFilter } from './purchase-reads.js';

export interface SearchFilter {
  readonly field: SearchFilterField;
  readonly operator: SearchFilterOperator;
  readonly value: string;
}

/**
 * A scope, or the reason no scope could be made of the filters. Never a
 * scope with the unreadable filter dropped: a dropped filter is the defect,
 * not the fix.
 */
export type SearchScopeResult =
  | { readonly ok: true; readonly scope: PurchaseScopeFilter }
  | { readonly ok: false; readonly message: string };

const OPERATORS_BY_FIELD: Readonly<Record<SearchFilterField, readonly SearchFilterOperator[]>> = {
  source: ['eq'],
  status: ['eq'],
  orderedAt: ['gte', 'lte'],
};

/** Mutable while the list is read; the result is the immutable scope. */
interface ScopeUnderConstruction {
  readonly sources: string[];
  readonly statuses: PurchaseStatus[];
  from: string | undefined;
  to: string | undefined;
}

/** The reason a filter could not be applied, or null when it was. */
type Refusal = string | null;

function unsupportedPairing(filter: SearchFilter): Refusal {
  const supported = OPERATORS_BY_FIELD[filter.field];
  if (supported.includes(filter.operator)) return null;
  return `Filter field '${filter.field}' does not support operator '${filter.operator}' (supported: ${supported.join(', ')})`;
}

function readStatus(scope: ScopeUnderConstruction, value: string): Refusal {
  const parsed = PurchaseStatusSchema.safeParse(value);
  if (!parsed.success) return `Filter value '${value}' is not a purchase status`;
  scope.statuses.push(parsed.data);
  return null;
}

function readBound(
  scope: ScopeUnderConstruction,
  operator: SearchFilterOperator,
  value: string
): Refusal {
  const parsed = IsoTimestampSchema.safeParse(value);
  if (!parsed.success) {
    return `Filter value '${value}' is not an ISO-8601 timestamp with a timezone, e.g. 2026-02-02T01:41:21Z`;
  }
  // Tightest bound wins, which is what the conjunction of two bounds on one
  // field already says.
  if (operator === 'gte' && (scope.from === undefined || parsed.data > scope.from)) {
    scope.from = parsed.data;
  }
  if (operator === 'lte' && (scope.to === undefined || parsed.data < scope.to)) {
    scope.to = parsed.data;
  }
  return null;
}

function readFilter(scope: ScopeUnderConstruction, filter: SearchFilter): Refusal {
  const pairing = unsupportedPairing(filter);
  if (pairing !== null) return pairing;

  switch (filter.field) {
    case 'source':
      scope.sources.push(filter.value);
      return null;
    case 'status':
      return readStatus(scope, filter.value);
    case 'orderedAt':
      return readBound(scope, filter.operator, filter.value);
  }
}

/**
 * The orders a filter list denotes, or a message naming what could not be
 * applied.
 *
 * An empty list is a scope over everything, which is what a caller sending
 * `filters: []` means and is indistinguishable from sending none.
 */
export function searchFilterScope(filters: readonly SearchFilter[]): SearchScopeResult {
  const scope: ScopeUnderConstruction = {
    sources: [],
    statuses: [],
    from: undefined,
    to: undefined,
  };

  for (const filter of filters) {
    const refusal = readFilter(scope, filter);
    if (refusal !== null) return { ok: false, message: refusal };
  }

  return {
    ok: true,
    scope: {
      ...(scope.sources.length > 0 ? { sources: scope.sources } : {}),
      ...(scope.statuses.length > 0 ? { statuses: scope.statuses } : {}),
      ...(scope.from === undefined ? {} : { from: scope.from }),
      ...(scope.to === undefined ? {} : { to: scope.to }),
    },
  };
}
