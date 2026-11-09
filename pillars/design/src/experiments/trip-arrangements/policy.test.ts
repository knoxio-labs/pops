import { describe, expect, it } from 'vitest';

import { createArrangementState } from './fixture';
import {
  arrangementRows,
  cancellationState,
  policyFindings,
  type ArrangementPolicy,
} from './model';

describe('explicit policy evidence and clocks', () => {
  const policy: ArrangementPolicy = {
    recordId: 'source',
    source: 'Fictional terms',
    notes: '',
    cancellation: { at: '2028-01-02T10:00:00+11:00', timeZone: 'Australia/Sydney' },
  };

  it.each([
    ['2028-01-01T22:59:59Z', 'upcoming'],
    ['2028-01-01T23:00:00Z', 'now'],
    ['2028-01-01T23:00:01Z', 'passed'],
    ['invalid', 'invalid'],
    ['2027-02-30T10:00:00Z', 'invalid'],
  ])('compares source instants at boundary %s as %s', (reference, expected) => {
    expect(cancellationState(policy, reference)).toBe(expected);
  });

  it('keeps unknown prices and deadlines absent and validates explicit zero without a default currency', () => {
    expect(cancellationState(undefined, 'invalid')).toBe('unknown');
    expect(cancellationState({ recordId: 'x', source: '', notes: '' }, 'invalid')).toBe('unknown');
    expect(policyFindings({ recordId: 'x', source: '', notes: '' })).toEqual([]);
    expect(policyFindings({ ...policy, changeCost: { amount: 0, currency: 'BRL' } })).toEqual([]);
    const state = createArrangementState();
    expect(arrangementRows(state).some((row) => row.policy === undefined)).toBe(true);
    expect(state.policies.find((source) => source.changeCost)?.changeCost).toEqual({
      amount: 180,
      currency: 'AUD',
    });
  });

  it.each([
    { amount: -1, currency: 'AUD' },
    { amount: Number.NaN, currency: 'BRL' },
    { amount: 12, currency: ' ' },
  ])('reports invalid captured cost %j', (changeCost) => {
    expect(policyFindings({ ...policy, changeCost })).toContainEqual({
      id: 'change-cost',
      message: 'The source change cost or currency is invalid.',
    });
  });

  it('reports invalid explicit deadline zones and impossible dates without replacing them', () => {
    const invalid = {
      ...policy,
      cancellation: { at: '2027-02-30T10:00:00Z', timeZone: 'Invalid/Zone' },
    };
    expect(policyFindings(invalid)).toContainEqual({
      id: 'cancellation',
      message: 'The source cancellation time or zone is invalid.',
    });
    expect(cancellationState(invalid, '2028-01-01T00:00:00Z')).toBe('invalid');
    expect(invalid.cancellation.at).toBe('2027-02-30T10:00:00Z');
    expect(
      createArrangementState('invalid-policy').policies.every(
        (source) => policyFindings(source).length === 2
      )
    ).toBe(true);
  });

  it('creates independent source fixtures with no hidden writes or persistence', () => {
    const state = createArrangementState();
    state.canvas.records.splice(0, 1);
    state.policies.splice(0, 1);
    expect(createArrangementState().canvas.records.length).toBeGreaterThan(
      state.canvas.records.length
    );
    expect(createArrangementState().policies).toHaveLength(2);
    expect(arrangementRows(createArrangementState('empty'))).toEqual([]);
  });
});
