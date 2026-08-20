/**
 * Reading `POST /search`'s filters as a scope.
 *
 * The failure these are written against is silence: a filter the pillar
 * cannot apply must never turn into a scope that omits it, because the
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

import type { SearchFilter, SearchScopeResult } from '../index.js';

const SUPPORTED_PAIRINGS: readonly SearchFilter[] = [
  { field: 'source', operator: 'eq', value: 'woolworths' },
  { field: 'status', operator: 'eq', value: 'linked' },
  { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00Z' },
  { field: 'orderedAt', operator: 'lte', value: '2026-01-31T00:00:00Z' },
];

function isSupported(filter: { field: string; operator: string }): boolean {
  return SUPPORTED_PAIRINGS.some(
    (supported) => supported.field === filter.field && supported.operator === filter.operator
  );
}

function scopeOf(result: SearchScopeResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected a scope, got: ${result.message}`);
  return { ...result.scope };
}

function refusalOf(result: SearchScopeResult): string {
  if (result.ok)
    throw new Error(`expected a refusal, got a scope: ${JSON.stringify(result.scope)}`);
  return result.message;
}

describe('an empty filter list', () => {
  it('is a scope over everything, which is what sending none means', () => {
    expect(scopeOf(searchFilterScope([]))).toEqual({});
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
          expect(scopeOf(searchFilterScope([supported]))).not.toEqual({});
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
  it('collects sources, so repeating the filter widens rather than contradicts', () => {
    const result = searchFilterScope([
      { field: 'source', operator: 'eq', value: 'amazon' },
      { field: 'source', operator: 'eq', value: 'woolworths' },
    ]);

    expect(scopeOf(result)).toEqual({ sources: ['amazon', 'woolworths'] });
  });

  it('collects statuses the same way', () => {
    const result = searchFilterScope([
      { field: 'status', operator: 'eq', value: 'linked' },
      { field: 'status', operator: 'eq', value: 'partial' },
    ]);

    expect(scopeOf(result)).toEqual({ statuses: ['linked', 'partial'] });
  });

  it('keeps the tightest of two lower bounds, which is what their conjunction means', () => {
    const result = searchFilterScope([
      { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00Z' },
      { field: 'orderedAt', operator: 'gte', value: '2026-02-01T00:00:00Z' },
    ]);

    expect(scopeOf(result)).toEqual({ from: '2026-02-01T00:00:00.000Z' });
  });

  it('keeps the tightest of two upper bounds', () => {
    const result = searchFilterScope([
      { field: 'orderedAt', operator: 'lte', value: '2026-02-01T00:00:00Z' },
      { field: 'orderedAt', operator: 'lte', value: '2026-01-01T00:00:00Z' },
    ]);

    expect(scopeOf(result)).toEqual({ to: '2026-01-01T00:00:00.000Z' });
  });

  it('combines unlike fields into one scope rather than letting the last one win', () => {
    const result = searchFilterScope([
      { field: 'source', operator: 'eq', value: 'amazon' },
      { field: 'status', operator: 'eq', value: 'linked' },
      { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00Z' },
      { field: 'orderedAt', operator: 'lte', value: '2026-01-31T00:00:00Z' },
    ]);

    expect(scopeOf(result)).toEqual({
      sources: ['amazon'],
      statuses: ['linked'],
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
    });
  });
});

describe('a value the field cannot hold', () => {
  it('refuses a status this pillar does not have', () => {
    // `shipped` is a shipment status. Scoping to it would match no order,
    // and an empty result is exactly what a working filter can look like.
    const message = refusalOf(
      searchFilterScope([{ field: 'status', operator: 'eq', value: 'shipped' }])
    );

    expect(message).toContain('shipped');
  });

  it('refuses a date that is not a timestamp', () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'orderedAt', operator: 'gte', value: 'yesterday' }])
    );

    expect(message).toContain('yesterday');
  });

  it('refuses a date with no timezone, which no stored order carries', () => {
    const result = searchFilterScope([
      { field: 'orderedAt', operator: 'lte', value: '2026-01-31T00:00:00' },
    ]);

    expect(result.ok).toBe(false);
    expect(refusalOf(result)).toContain('2026-01-31T00:00:00');
  });

  it('refuses the whole list, not just the bad filter, so no scope is half-applied', () => {
    const result = searchFilterScope([
      { field: 'source', operator: 'eq', value: 'amazon' },
      { field: 'status', operator: 'eq', value: 'shipped' },
    ]);

    expect(result.ok).toBe(false);
  });

  it('refuses a date whose fields name no instant', () => {
    const message = refusalOf(
      searchFilterScope([{ field: 'orderedAt', operator: 'gte', value: '2026-13-45T00:00:00Z' }])
    );

    expect(message).toContain('2026-13-45T00:00:00Z');
  });
});

describe('a bound written in some other valid ISO-8601 form', () => {
  it('takes an offset bound to the instant it names, not the text it sorts as', () => {
    // `2026-01-01T10:00:00+10:00` IS midnight UTC. Left as text it sorts
    // after every `2026-01-01T0…Z` row in the column, so the window would be
    // ten hours away from the one the caller asked for. Sydney is UTC+10/+11,
    // so this is the bound a local caller writes by hand.
    expect(
      scopeOf(
        searchFilterScope([
          { field: 'orderedAt', operator: 'gte', value: '2026-01-01T10:00:00+10:00' },
        ])
      )
    ).toEqual({ from: '2026-01-01T00:00:00.000Z' });
  });

  it('gives a second-precision bound the milliseconds the column carries', () => {
    // `…21Z` unpadded sorts BEFORE `…21.500Z`, because `.` precedes `Z`, so
    // an `lte` bound written without a fraction would include an instant
    // half a second after it.
    expect(
      scopeOf(
        searchFilterScope([{ field: 'orderedAt', operator: 'lte', value: '2026-02-02T01:41:21Z' }])
      )
    ).toEqual({ to: '2026-02-02T01:41:21.000Z' });
  });

  it('leaves a bound already in the stored form exactly as it was', () => {
    expect(
      scopeOf(
        searchFilterScope([
          { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00.000Z' },
        ])
      )
    ).toEqual({ from: '2026-01-01T00:00:00.000Z' });
  });

  it('picks the tighter of two bounds by instant, not by spelling', () => {
    // The offset bound is the LATER instant and the earlier string. A
    // tightest-bound rule comparing the two as text keeps the wrong one and
    // widens the window by ten hours.
    expect(
      scopeOf(
        searchFilterScope([
          { field: 'orderedAt', operator: 'gte', value: '2026-01-01T00:00:00Z' },
          { field: 'orderedAt', operator: 'gte', value: '2026-01-01T20:00:00+10:00' },
        ])
      )
    ).toEqual({ from: '2026-01-01T10:00:00.000Z' });
  });
});
