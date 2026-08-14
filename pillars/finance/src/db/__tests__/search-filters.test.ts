/**
 * Reading `POST /search`'s filters as a per-adapter scope.
 *
 * The failure these are written against is silence (POPS-2022): a filter the
 * pillar cannot apply must never turn into a scope that omits it, because the
 * caller receives a 200 either way and the results of an ignored filter are
 * indistinguishable from a filter that matched broadly. So every case here
 * asserts one of two things — the scope says what the filter said, or the
 * request is refused with a message naming what could not be applied.
 *
 * Every declared field is covered against every declared operator, the
 * supported pairings and the unsupported ones alike, so a field added to the
 * contract without a reading here shows up as an untested pairing rather
 * than as a filter that quietly does nothing.
 */
import { describe, expect, it } from 'vitest';

import { SEARCH_FILTER_FIELDS, SEARCH_FILTER_OPERATORS } from '../../contract/rest-search.js';
import { searchFilterScope } from '../index.js';

import type { FinanceSearchScope, SearchFilter, SearchScopeResult } from '../index.js';

const SUPPORTED_PAIRINGS: readonly SearchFilter[] = [
  { field: 'type', operator: 'eq', value: 'purchase' },
  { field: 'entityId', operator: 'eq', value: 'ent-1' },
  { field: 'date', operator: 'gte', value: '2026-01-01' },
  { field: 'date', operator: 'lte', value: '2026-01-31' },
  { field: 'period', operator: 'eq', value: 'Monthly' },
  { field: 'active', operator: 'eq', value: 'true' },
  { field: 'priority', operator: 'eq', value: 'Soon' },
];

function isSupported(filter: { field: string; operator: string }): boolean {
  return SUPPORTED_PAIRINGS.some(
    (supported) => supported.field === filter.field && supported.operator === filter.operator
  );
}

function scopeOf(result: SearchScopeResult): FinanceSearchScope {
  if (!result.ok) throw new Error(`expected a scope, got: ${result.message}`);
  return result.scope;
}

function refusalOf(result: SearchScopeResult): string {
  if (result.ok)
    throw new Error(`expected a refusal, got a scope: ${JSON.stringify(result.scope)}`);
  return result.message;
}

const EMPTY_SCOPE: FinanceSearchScope = { transactions: {}, budgets: {}, wishlist: {} };

describe('an empty filter list', () => {
  it('is a scope over everything, which is what sending none means', () => {
    expect(scopeOf(searchFilterScope([]))).toEqual(EMPTY_SCOPE);
  });
});

describe('every declared field against every declared operator', () => {
  for (const field of SEARCH_FILTER_FIELDS) {
    for (const operator of SEARCH_FILTER_OPERATORS) {
      const supported = SUPPORTED_PAIRINGS.find(
        (pairing) => pairing.field === field && pairing.operator === operator
      );

      if (supported !== undefined) {
        it(`reads '${field} ${operator}' into the scope`, () => {
          expect(scopeOf(searchFilterScope([supported]))).not.toEqual(EMPTY_SCOPE);
        });
        continue;
      }

      it(`refuses '${field} ${operator}' rather than dropping it`, () => {
        const value = SUPPORTED_PAIRINGS.find((pairing) => pairing.field === field)?.value ?? 'x';
        const message = refusalOf(searchFilterScope([{ field, operator, value }]));

        // Both halves, because either alone leaves the caller guessing which
        // one the pillar objected to.
        expect(message).toContain(field);
        expect(message).toContain(operator);
      });
    }
  }

  it('covers a pairing for every declared field, so a new field cannot arrive untested', () => {
    for (const field of SEARCH_FILTER_FIELDS) {
      expect(SUPPORTED_PAIRINGS.some((pairing) => pairing.field === field)).toBe(true);
    }
    for (const pairing of SUPPORTED_PAIRINGS) {
      expect(isSupported(pairing)).toBe(true);
    }
  });
});

describe('what each supported field reads into', () => {
  it('scopes transactions by type', () => {
    const result = searchFilterScope([{ field: 'type', operator: 'eq', value: 'refund' }]);
    expect(scopeOf(result)).toEqual({
      transactions: { type: 'refund' },
      budgets: {},
      wishlist: {},
    });
  });

  it('scopes transactions by entityId', () => {
    const result = searchFilterScope([{ field: 'entityId', operator: 'eq', value: 'ent-42' }]);
    expect(scopeOf(result)).toEqual({
      transactions: { entityId: 'ent-42' },
      budgets: {},
      wishlist: {},
    });
  });

  it('keeps the tightest of two lower date bounds, which is what their conjunction means', () => {
    const result = searchFilterScope([
      { field: 'date', operator: 'gte', value: '2026-01-01' },
      { field: 'date', operator: 'gte', value: '2026-02-01' },
    ]);
    expect(scopeOf(result)).toEqual({
      transactions: { startDate: '2026-02-01' },
      budgets: {},
      wishlist: {},
    });
  });

  it('keeps the tightest of two upper date bounds', () => {
    const result = searchFilterScope([
      { field: 'date', operator: 'lte', value: '2026-02-01' },
      { field: 'date', operator: 'lte', value: '2026-01-01' },
    ]);
    expect(scopeOf(result)).toEqual({
      transactions: { endDate: '2026-01-01' },
      budgets: {},
      wishlist: {},
    });
  });

  it('scopes budgets by period', () => {
    const result = searchFilterScope([{ field: 'period', operator: 'eq', value: 'Yearly' }]);
    expect(scopeOf(result)).toEqual({
      transactions: {},
      budgets: { period: 'Yearly' },
      wishlist: {},
    });
  });

  it('scopes budgets by active', () => {
    const result = searchFilterScope([{ field: 'active', operator: 'eq', value: 'false' }]);
    expect(scopeOf(result)).toEqual({
      transactions: {},
      budgets: { active: false },
      wishlist: {},
    });
  });

  it('scopes wishlist by priority', () => {
    const result = searchFilterScope([{ field: 'priority', operator: 'eq', value: 'Dreaming' }]);
    expect(scopeOf(result)).toEqual({
      transactions: {},
      budgets: {},
      wishlist: { priority: 'Dreaming' },
    });
  });

  it('combines fields from different domains into one scope, unaffected by each other', () => {
    const result = searchFilterScope([
      { field: 'type', operator: 'eq', value: 'purchase' },
      { field: 'period', operator: 'eq', value: 'Monthly' },
      { field: 'priority', operator: 'eq', value: 'Needing' },
    ]);
    expect(scopeOf(result)).toEqual({
      transactions: { type: 'purchase' },
      budgets: { period: 'Monthly' },
      wishlist: { priority: 'Needing' },
    });
  });
});

describe('a repeated equality filter on the same field', () => {
  it('is a no-op when the value agrees', () => {
    const result = searchFilterScope([
      { field: 'type', operator: 'eq', value: 'purchase' },
      { field: 'type', operator: 'eq', value: 'purchase' },
    ]);
    expect(scopeOf(result)).toEqual({
      transactions: { type: 'purchase' },
      budgets: {},
      wishlist: {},
    });
  });

  it('is refused when the values conflict, rather than the last one silently winning', () => {
    const message = refusalOf(
      searchFilterScope([
        { field: 'type', operator: 'eq', value: 'purchase' },
        { field: 'type', operator: 'eq', value: 'refund' },
      ])
    );
    expect(message).toContain('purchase');
    expect(message).toContain('refund');
  });

  it('is refused for entityId too', () => {
    const result = searchFilterScope([
      { field: 'entityId', operator: 'eq', value: 'ent-1' },
      { field: 'entityId', operator: 'eq', value: 'ent-2' },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('a value the field cannot hold', () => {
  it('refuses a transaction type this pillar does not have', () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'type', operator: 'eq', value: 'shipped' }])
    );
    expect(message).toContain('shipped');
  });

  it('refuses a wish-list priority this pillar does not have', () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'priority', operator: 'eq', value: 'Urgent' }])
    );
    expect(message).toContain('Urgent');
  });

  it('refuses a date that is not YYYY-MM-DD', () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'date', operator: 'gte', value: 'yesterday' }])
    );
    expect(message).toContain('yesterday');
  });

  it('refuses a full timestamp for date, since the column is date-only', () => {
    const result = searchFilterScope([
      { field: 'date', operator: 'lte', value: '2026-01-31T00:00:00Z' },
    ]);
    expect(result.ok).toBe(false);
  });

  it("refuses an 'active' value that is not true/false", () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'active', operator: 'eq', value: 'yes' }])
    );
    expect(message).toContain('yes');
  });

  it('refuses the whole list, not just the bad filter, so no scope is half-applied', () => {
    const result = searchFilterScope([
      { field: 'type', operator: 'eq', value: 'purchase' },
      { field: 'priority', operator: 'eq', value: 'Urgent' },
    ]);
    expect(result.ok).toBe(false);
  });
});
