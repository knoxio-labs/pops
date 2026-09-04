import { totalRulesApplied } from '@/kit/import-summary-sections';
import { describe, expect, it } from 'vitest';

import type { CommitResultFixture } from '@/fixtures/import-transactions';

function result(overrides: Partial<CommitResultFixture>): CommitResultFixture {
  return {
    entitiesCreated: 0,
    transactionsImported: 0,
    transactionsFailed: 0,
    rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
    tagRulesApplied: 0,
    retroactiveReclassifications: 0,
    ...overrides,
  };
}

describe('totalRulesApplied', () => {
  it('sums every classification-rule op and tag-rule applications together', () => {
    const r = result({
      rulesApplied: { add: 2, edit: 1, disable: 1, remove: 0 },
      tagRulesApplied: 2,
    });
    expect(totalRulesApplied(r)).toBe(6);
  });

  it('is non-zero when only tag rules were applied — the case the Rule Breakdown box must still show', () => {
    const r = result({ tagRulesApplied: 2 });
    expect(totalRulesApplied(r)).toBe(2);
  });

  it('is zero when nothing was applied', () => {
    expect(totalRulesApplied(result({}))).toBe(0);
  });
});
