import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { applyAffectedToLocalTags, useTagActions } from './useTagReviewActions';

import type { ConfirmedTransaction, TagRuleImpactItem } from '@pops/finance';

import type { ConfirmedGroup } from './tagReviewUtils';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function makeTransaction(checksum: string, suggested: string[]): ConfirmedTransaction {
  return {
    date: '2026-09-01',
    description: 'SQ *PALMS ON OXFORD',
    amount: -42,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
    tags: [...suggested],
    suggestedTags: suggested.map((tag) => ({ tag, source: 'rule' })),
  };
}

function impact(transactionId: string, tags: string[]): TagRuleImpactItem {
  return {
    transactionId,
    description: 'SQ *PALMS ON OXFORD',
    before: { suggestedTags: [] },
    after: { suggestedTags: tags.map((tag) => ({ tag, source: 'rule' as const })) },
  };
}

function renderTagActions(transactions: ConfirmedTransaction[]) {
  const suggestedTagMeta = Object.fromEntries(
    transactions.map((t) => [t.checksum, t.suggestedTags ?? []])
  );
  return renderHook(() => {
    const [localTags, setLocalTags] = useState<Record<string, string[]>>(() =>
      Object.fromEntries(transactions.map((t) => [t.checksum, t.tags ?? []]))
    );
    const actions = useTagActions({
      localTags,
      setLocalTags,
      suggestedTagMeta,
      confirmedTransactions: transactions,
    });
    return { localTags, ...actions };
  });
}

describe('Tag Review merges keep one value per single-valued facet (POPS-3668)', () => {
  it('applyAffectedToLocalTags replaces the venue a saved rule writes', () => {
    const next = applyAffectedToLocalTags(
      { a: ['venue:takeaway', 'contains:food'] },
      [impact('a', ['venue:restaurant', 'contains:alcohol'])],
      {
        a: [
          { tag: 'venue:takeaway', source: 'ai' },
          { tag: 'contains:food', source: 'ai' },
        ],
      }
    );
    expect(next.a).toEqual(['contains:food', 'venue:restaurant', 'contains:alcohol']);
  });

  it('handleApplyGroupTags replaces a single-valued value and unions contains', () => {
    const txns = [makeTransaction('a', ['venue:takeaway', 'contains:food'])];
    const { result } = renderTagActions(txns);
    const group: ConfirmedGroup = { entityName: 'Palms', transactions: txns };

    act(() => result.current.handleApplyGroupTags(group, ['venue:pub', 'contains:alcohol']));
    expect(result.current.localTags.a).toEqual(['contains:food', 'venue:pub', 'contains:alcohol']);
  });

  it('handleAcceptAll lets the suggested venue replace a hand-picked one', () => {
    const txns = [makeTransaction('a', ['venue:pub'])];
    const { result } = renderTagActions(txns);

    act(() => result.current.updateTag('a', ['venue:takeaway']));
    act(() => result.current.handleAcceptAll());
    expect(result.current.localTags.a).toEqual(['venue:pub']);
  });
});
