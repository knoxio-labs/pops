/**
 * `POST /search`'s structured filters, read as the item scope they denote.
 *
 * The contract closes the field and operator vocabularies, so the shapes
 * that reach here are already the supported ones. One thing it cannot
 * close remains, and it is a refusal rather than an adjustment: **whether
 * the value is one.** `inUse eq maybe` and `deductible eq sometimes` name
 * nothing — `true`/`false` are the only two values those columns hold — and
 * returning zero hits for them is precisely the answer a caller cannot tell
 * from a filter that worked.
 *
 * A repeated filter on the same field is a conflict, not a widening: every
 * field here names one value per row, so two different values for the same
 * field can only ever match nothing. It is refused rather than silently
 * resolved either direction — the same rule finance's `type`/`entityId`/
 * `period`/`active`/`priority` filters use, for the same reason.
 */
import type { SearchFilterField, SearchFilterOperator } from '../../contract/rest-search.js';

export interface SearchFilter {
  readonly field: SearchFilterField;
  readonly operator: SearchFilterOperator;
  readonly value: string;
}

export interface InventorySearchScope {
  readonly room?: string;
  readonly type?: string;
  readonly condition?: string;
  readonly inUse?: boolean;
  readonly deductible?: boolean;
  readonly locationId?: string;
  readonly assetId?: string;
}

/**
 * A scope, or the reason no scope could be made of the filters. Never a
 * scope with the unreadable filter dropped: a dropped filter is the defect,
 * not the fix.
 */
export type SearchScopeResult =
  | { readonly ok: true; readonly scope: InventorySearchScope }
  | { readonly ok: false; readonly message: string };

/** Mutable while the list is read; the result is the immutable scope. */
interface ScopeUnderConstruction {
  room: string | undefined;
  type: string | undefined;
  condition: string | undefined;
  inUse: boolean | undefined;
  deductible: boolean | undefined;
  locationId: string | undefined;
  assetId: string | undefined;
}

/** The reason a filter could not be applied, or null when it was. */
type Refusal = string | null;

function conflict(field: SearchFilterField, existing: string, incoming: string): Refusal {
  if (existing === incoming) return null;
  return `Filter field '${field}' was given conflicting values '${existing}' and '${incoming}'`;
}

function readString(
  scope: ScopeUnderConstruction,
  field: 'room' | 'type' | 'condition' | 'locationId' | 'assetId',
  value: string
): Refusal {
  const existing = scope[field];
  if (existing !== undefined) {
    const refusal = conflict(field, existing, value);
    if (refusal !== null) return refusal;
  }
  scope[field] = value;
  return null;
}

function readBool(
  scope: ScopeUnderConstruction,
  field: 'inUse' | 'deductible',
  value: string
): Refusal {
  if (value !== 'true' && value !== 'false') {
    return `Filter value '${value}' is not 'true' or 'false'`;
  }
  const parsed = value === 'true';
  const existing = scope[field];
  if (existing !== undefined && existing !== parsed) {
    return `Filter field '${field}' was given conflicting values '${String(existing)}' and '${value}'`;
  }
  scope[field] = parsed;
  return null;
}

function readFilter(scope: ScopeUnderConstruction, filter: SearchFilter): Refusal {
  switch (filter.field) {
    case 'room':
    case 'type':
    case 'condition':
    case 'locationId':
    case 'assetId':
      return readString(scope, filter.field, filter.value);
    case 'inUse':
    case 'deductible':
      return readBool(scope, filter.field, filter.value);
  }
}

/**
 * The item scope a filter list denotes, or a message naming what could not
 * be applied.
 *
 * An empty list is a scope over everything, which is what a caller sending
 * `filters: []` means and is indistinguishable from sending none.
 */
export function searchFilterScope(filters: readonly SearchFilter[]): SearchScopeResult {
  const scope: ScopeUnderConstruction = {
    room: undefined,
    type: undefined,
    condition: undefined,
    inUse: undefined,
    deductible: undefined,
    locationId: undefined,
    assetId: undefined,
  };

  for (const filter of filters) {
    const refusal = readFilter(scope, filter);
    if (refusal !== null) return { ok: false, message: refusal };
  }

  return {
    ok: true,
    scope: {
      ...(scope.room === undefined ? {} : { room: scope.room }),
      ...(scope.type === undefined ? {} : { type: scope.type }),
      ...(scope.condition === undefined ? {} : { condition: scope.condition }),
      ...(scope.inUse === undefined ? {} : { inUse: scope.inUse }),
      ...(scope.deductible === undefined ? {} : { deductible: scope.deductible }),
      ...(scope.locationId === undefined ? {} : { locationId: scope.locationId }),
      ...(scope.assetId === undefined ? {} : { assetId: scope.assetId }),
    },
  };
}
