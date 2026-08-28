/**
 * The backfill's only guard against undoing 0076 (POPS-2607).
 *
 * These pin the two halves that matter: it must fire on a second value of a
 * single-valued facet, and it must stay silent on a second value of a
 * multi-valued one — a scan that flagged every repeated facet would be turned
 * off by the first `contains:` pair and guard nothing thereafter.
 */
import { describe, expect, it } from 'vitest';

import { findTagRuleConflicts, type ScannedTransaction } from '../tag-rule-conflicts.js';

function row(description: string, tags: readonly string[]): ScannedTransaction {
  return { description, tags: JSON.stringify(tags) };
}

describe('findTagRuleConflicts', () => {
  it('reports a rule that would add a second venue', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'COLES', tags: ['venue:supermarket'] }],
      [row('COLES PORT DOUGLAS', ['venue:cafe', 'occasion:travel'])]
    );

    expect(conflicts).toEqual([
      {
        pattern: 'COLES',
        description: 'COLES PORT DOUGLAS',
        incoming: 'venue:supermarket',
        existing: 'venue:cafe',
      },
    ]);
  });

  it('stays silent when the row already carries the same value', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'COLES', tags: ['venue:supermarket'] }],
      [row('COLES PORT DOUGLAS', ['venue:supermarket'])]
    );

    expect(conflicts).toEqual([]);
  });

  it('stays silent when the row has no value on that facet at all', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'COLES', tags: ['venue:supermarket'] }],
      [row('COLES PORT DOUGLAS', ['occasion:travel'])]
    );

    expect(conflicts).toEqual([]);
  });

  it('does not flag a second contains:, which the facet allows', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'YO-CHI', tags: ['contains:ice-cream'] }],
      [row('YO-CHI SURRY HILLS', ['contains:food'])]
    );

    expect(conflicts).toEqual([]);
  });

  it('does not flag an open-namespace value, which is not cardinality-bound', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'QANTAS', tags: ['trip:tokyo-2026'] }],
      [row('QANTAS AIRWAYS', ['trip:hunter-valley-2026'])]
    );

    expect(conflicts).toEqual([]);
  });

  it('reports every conflicting row a rule matches, not just the first', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'HOYTS', tags: ['occasion:out'] }],
      [
        row('HOYTS SYDNEY', ['occasion:home']),
        row('HOYTS BROADWAY', ['occasion:work']),
        row('HOYTS ENTERTAINMENT QUARTER', ['occasion:out']),
      ]
    );

    expect(conflicts.map((c) => c.existing)).toEqual(['occasion:home', 'occasion:work']);
  });

  it('ignores a row the pattern does not match', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'COLES', tags: ['venue:supermarket'] }],
      [row('WOOLWORTHS METRO', ['venue:cafe'])]
    );

    expect(conflicts).toEqual([]);
  });

  it('matches through the digits the normalizer strips from both sides', () => {
    const conflicts = findTagRuleConflicts(
      [{ pattern: 'HOYTS 1034', tags: ['occasion:out'] }],
      [row('HOYTS 2251 SYDNEY', ['occasion:home'])]
    );

    expect(conflicts.map((c) => c.existing)).toEqual(['occasion:home']);
  });
});
