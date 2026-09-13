import { describe, expect, it } from 'vitest';

import { groupTagSources } from './groupTagSources';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

function row(checksum: string): ConfirmedTransaction {
  return {
    date: '2026-03-01',
    description: `ROW ${checksum}`,
    amount: -10,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
  };
}

describe('groupTagSources (POPS-252)', () => {
  it('keeps every distinct source a tag came from across the group’s rows', () => {
    const meta: Record<string, SuggestedTag[]> = {
      a: [{ tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS' }],
      b: [{ tag: 'Groceries', source: 'ai' }],
    };
    expect(groupTagSources([row('a'), row('b')], meta).get('Groceries')).toEqual([
      { source: 'rule', pattern: 'WOOLWORTHS', isNew: undefined },
      { source: 'ai', pattern: undefined, isNew: undefined },
    ]);
  });

  it('lists the same rule once however many rows it supplied the tag on', () => {
    const rule = { tag: 'Groceries', source: 'rule' as const, pattern: 'WOOLWORTHS' };
    const sources = groupTagSources([row('a'), row('b'), row('c')], {
      a: [rule],
      b: [rule],
      c: [rule],
    });
    expect(sources.get('Groceries')).toHaveLength(1);
  });

  it('keeps two rules with different patterns apart', () => {
    const sources = groupTagSources([row('a'), row('b')], {
      a: [{ tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS' }],
      b: [{ tag: 'Groceries', source: 'rule', pattern: 'WOOLIES' }],
    });
    expect(sources.get('Groceries')?.map((s) => s.pattern)).toEqual(['WOOLWORTHS', 'WOOLIES']);
  });

  it('has no entry for a tag nothing suggested', () => {
    expect(groupTagSources([row('a')], { a: [] }).has('Groceries')).toBe(false);
  });

  it('only reads the rows it is given', () => {
    const sources = groupTagSources([row('a')], {
      a: [],
      other: [{ tag: 'Groceries', source: 'entity' }],
    });
    expect(sources.size).toBe(0);
  });
});
