import { describe, expect, it } from 'vitest';

import { rulesFor, ruleMatcherFor } from '../rules.js';
import { charge, rule } from './solver-fixtures.js';

describe('which rules apply to a charge', () => {
  it('takes the ones decided for its own source', () => {
    const applies = rulesFor(charge({ source: 'amazon' }), [
      rule({ id: 'a', source: 'amazon' }),
      rule({ id: 'b', source: 'bunnings' }),
    ]);
    expect(applies.map((r) => r.id)).toEqual(['a']);
  });

  it('takes an unscoped rule for every source', () => {
    // A processor descriptor fronts many merchants, which is the case a
    // null source exists for.
    const applies = rulesFor(charge({ source: 'bunnings' }), [rule({ id: 'a', source: null })]);
    expect(applies.map((r) => r.id)).toEqual(['a']);
  });

  it('drops a deactivated rule, which is how a human retracts one', () => {
    expect(rulesFor(charge(), [rule({ isActive: false })])).toEqual([]);
  });

  it('drops a rule below the confidence floor', () => {
    // A rule inherits the confidence of the link that taught it, so this is
    // the one learned from the ladder's weakest guess.
    expect(rulesFor(charge(), [rule({ confidence: 0.4 })])).toEqual([]);
  });

  it('orders by priority then id, never by the order it was handed', () => {
    const rules = [
      rule({ id: 'z', priority: 1 }),
      rule({ id: 'a', priority: 5 }),
      rule({ id: 'b', priority: 1 }),
    ];
    expect(rulesFor(charge(), rules).map((r) => r.id)).toEqual(['b', 'z', 'a']);
    expect(rulesFor(charge(), [...rules].reverse()).map((r) => r.id)).toEqual(['b', 'z', 'a']);
  });
});

describe('which rule speaks for a descriptor', () => {
  it('matches the merchant rather than the transaction', () => {
    // The stored pattern has already had its digits stripped, so a store
    // number cannot make one shop look like two.
    const matcher = ruleMatcherFor(charge(), [rule({ descriptionPattern: 'WOOLWORTHS SYDNEY' })]);
    expect(matcher('Woolworths 1234 Sydney')?.id).toBe('rule-1');
    expect(matcher('Woolworths 5567 Sydney')?.id).toBe('rule-1');
  });

  it('does not match an unrelated merchant', () => {
    const matcher = ruleMatcherFor(charge(), [rule()]);
    expect(matcher('BUNNINGS WAREHOUSE')).toBeNull();
  });

  it('returns the lowest-priority rule when several match', () => {
    const rules = [
      rule({ id: 'later', priority: 5 }),
      rule({ id: 'winner', priority: 1 }),
      rule({ id: 'tied', priority: 1 }),
    ];
    expect(ruleMatcherFor(charge(), rules)('AMZN MKTP AU')?.id).toBe('tied');
    expect(ruleMatcherFor(charge(), [...rules].reverse())('AMZN MKTP AU')?.id).toBe('tied');
  });

  it('honours a contains rule, which only a hand-written one can be', () => {
    const matcher = ruleMatcherFor(charge(), [
      rule({ matchType: 'contains', descriptionPattern: 'MKTP' }),
    ]);
    expect(matcher('AMZN MKTP AU 1234')?.id).toBe('rule-1');
    expect(matcher('BUNNINGS WAREHOUSE')).toBeNull();
  });

  it('honours a regex rule', () => {
    const matcher = ruleMatcherFor(charge(), [
      rule({ matchType: 'regex', descriptionPattern: '^AMZN (MKTP|PRIME)' }),
    ]);
    expect(matcher('AMZN PRIME AU')?.id).toBe('rule-1');
    expect(matcher('PAYPAL AMZN MKTP')).toBeNull();
  });

  it('ignores an unparseable regex rather than failing the whole sweep', () => {
    // A sweep is a batch over every charge in a window. One malformed row
    // aborting it would present as a night's reconciliation not happening.
    const matcher = ruleMatcherFor(charge(), [
      rule({ matchType: 'regex', descriptionPattern: 'AMZN (' }),
    ]);
    expect(matcher('AMZN MKTP AU')).toBeNull();
  });
});
