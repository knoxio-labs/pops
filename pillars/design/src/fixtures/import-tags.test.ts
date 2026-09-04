import { confirmedTxns, tagGroupsFrom, type ConfirmedTxn } from '@/fixtures/import-tags';
import { describe, expect, it } from 'vitest';

function confirmed(overrides: Partial<ConfirmedTxn>): ConfirmedTxn {
  return {
    checksum: 'x',
    date: '2026-01-01',
    description: 'Test',
    amount: -10,
    account: 'Amex',
    bucket: 'matched',
    rawRow: '{}',
    tags: [],
    suggestedTags: [],
    ...overrides,
  };
}

describe('tagGroupsFrom', () => {
  it('groups rows by resolved entity name', () => {
    const rows = [
      confirmed({ checksum: 'a', entity: { name: 'Woolworths', matchType: 'exact' } }),
      confirmed({ checksum: 'b', entity: { name: 'Woolworths', matchType: 'exact' } }),
      confirmed({ checksum: 'c', entity: { name: 'AGL', matchType: 'exact' } }),
    ];
    const groups = tagGroupsFrom(rows);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.entityName === 'Woolworths')?.transactions).toHaveLength(2);
    expect(groups.find((g) => g.entityName === 'AGL')?.transactions).toHaveLength(1);
  });

  it('falls back rows with no resolved entity into a single "No entity" group', () => {
    const rows = [
      confirmed({ checksum: 'a', entity: undefined }),
      confirmed({ checksum: 'b', entity: undefined }),
    ];
    const groups = tagGroupsFrom(rows);
    expect(groups).toEqual([{ entityName: 'No entity', transactions: rows }]);
  });

  it('returns no groups for an empty input, even though the fixture set is non-empty', () => {
    expect(tagGroupsFrom([])).toEqual([]);
    expect(confirmedTxns.length).toBeGreaterThan(0);
  });
});
