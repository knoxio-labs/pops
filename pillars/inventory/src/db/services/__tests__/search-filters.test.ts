/**
 * Reading `POST /search`'s filters as an item scope.
 *
 * The failure these are written against is silence: a filter the pillar
 * cannot apply must never turn into a scope that omits it, because the
 * caller receives a 200 either way and the results of an ignored filter are
 * indistinguishable from a filter that matched broadly. So every case here
 * asserts one of two things — the scope says what the filter said, or the
 * request is refused with a message naming what could not be applied.
 *
 * Every declared field is covered here, so a field added to the contract
 * without a reading here shows up as an untested field rather than as a
 * filter that quietly does nothing.
 */
import { describe, expect, it } from 'vitest';

import { SEARCH_FILTER_FIELDS } from '../../../contract/rest-search.js';
import { searchFilterScope } from '../search-filters.js';

import type { InventorySearchScope, SearchFilter, SearchScopeResult } from '../search-filters.js';

const SUPPORTED_FILTERS: readonly SearchFilter[] = [
  { field: 'room', operator: 'eq', value: 'Garage' },
  { field: 'type', operator: 'eq', value: 'Electronics' },
  { field: 'condition', operator: 'eq', value: 'Good' },
  { field: 'inUse', operator: 'eq', value: 'true' },
  { field: 'deductible', operator: 'eq', value: 'false' },
  { field: 'locationId', operator: 'eq', value: 'loc-1' },
  { field: 'assetId', operator: 'eq', value: 'AST-1' },
];

const EMPTY_SCOPE: InventorySearchScope = {};

function scopeOf(result: SearchScopeResult): InventorySearchScope {
  if (!result.ok) throw new Error(`expected a scope, got: ${result.message}`);
  return result.scope;
}

function refusalOf(result: SearchScopeResult): string {
  if (result.ok)
    throw new Error(`expected a refusal, got a scope: ${JSON.stringify(result.scope)}`);
  return result.message;
}

describe('an empty filter list', () => {
  it('is a scope over everything, which is what sending none means', () => {
    expect(scopeOf(searchFilterScope([]))).toEqual(EMPTY_SCOPE);
  });
});

describe('every declared field', () => {
  it('has a supported filter covering it, so a new field cannot arrive untested', () => {
    for (const field of SEARCH_FILTER_FIELDS) {
      expect(SUPPORTED_FILTERS.some((filter) => filter.field === field)).toBe(true);
    }
  });

  for (const filter of SUPPORTED_FILTERS) {
    it(`reads '${filter.field}' into the scope`, () => {
      expect(scopeOf(searchFilterScope([filter]))).not.toEqual(EMPTY_SCOPE);
    });
  }
});

describe('what each field reads into', () => {
  it('scopes by room', () => {
    const result = searchFilterScope([{ field: 'room', operator: 'eq', value: 'Garage' }]);
    expect(scopeOf(result)).toEqual({ room: 'Garage' });
  });

  it('scopes by type', () => {
    const result = searchFilterScope([{ field: 'type', operator: 'eq', value: 'Electronics' }]);
    expect(scopeOf(result)).toEqual({ type: 'Electronics' });
  });

  it('scopes by condition', () => {
    const result = searchFilterScope([{ field: 'condition', operator: 'eq', value: 'Good' }]);
    expect(scopeOf(result)).toEqual({ condition: 'Good' });
  });

  it('scopes by inUse, parsed to a boolean', () => {
    const result = searchFilterScope([{ field: 'inUse', operator: 'eq', value: 'true' }]);
    expect(scopeOf(result)).toEqual({ inUse: true });
  });

  it('scopes by deductible, parsed to a boolean', () => {
    const result = searchFilterScope([{ field: 'deductible', operator: 'eq', value: 'false' }]);
    expect(scopeOf(result)).toEqual({ deductible: false });
  });

  it('scopes by locationId', () => {
    const result = searchFilterScope([{ field: 'locationId', operator: 'eq', value: 'loc-1' }]);
    expect(scopeOf(result)).toEqual({ locationId: 'loc-1' });
  });

  it('scopes by assetId', () => {
    const result = searchFilterScope([{ field: 'assetId', operator: 'eq', value: 'AST-1' }]);
    expect(scopeOf(result)).toEqual({ assetId: 'AST-1' });
  });

  it('combines fields from different columns into one scope', () => {
    const result = searchFilterScope([
      { field: 'room', operator: 'eq', value: 'Garage' },
      { field: 'type', operator: 'eq', value: 'Electronics' },
      { field: 'inUse', operator: 'eq', value: 'true' },
    ]);
    expect(scopeOf(result)).toEqual({ room: 'Garage', type: 'Electronics', inUse: true });
  });
});

describe('a repeated filter on the same field', () => {
  it('is a no-op when the value agrees', () => {
    const result = searchFilterScope([
      { field: 'room', operator: 'eq', value: 'Garage' },
      { field: 'room', operator: 'eq', value: 'Garage' },
    ]);
    expect(scopeOf(result)).toEqual({ room: 'Garage' });
  });

  it('is refused when the values conflict, rather than the last one silently winning', () => {
    const message = refusalOf(
      searchFilterScope([
        { field: 'room', operator: 'eq', value: 'Garage' },
        { field: 'room', operator: 'eq', value: 'Attic' },
      ])
    );
    expect(message).toContain('Garage');
    expect(message).toContain('Attic');
  });

  it('is refused for a boolean field too', () => {
    const result = searchFilterScope([
      { field: 'inUse', operator: 'eq', value: 'true' },
      { field: 'inUse', operator: 'eq', value: 'false' },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('a value the field cannot hold', () => {
  it("refuses an 'inUse' value that is not true/false", () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'inUse', operator: 'eq', value: 'yes' }])
    );
    expect(message).toContain('yes');
  });

  it("refuses a 'deductible' value that is not true/false", () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'deductible', operator: 'eq', value: 'maybe' }])
    );
    expect(message).toContain('maybe');
  });

  it('refuses the whole list, not just the bad filter, so no scope is half-applied', () => {
    const result = searchFilterScope([
      { field: 'room', operator: 'eq', value: 'Garage' },
      { field: 'inUse', operator: 'eq', value: 'yes' },
    ]);
    expect(result.ok).toBe(false);
  });
});
