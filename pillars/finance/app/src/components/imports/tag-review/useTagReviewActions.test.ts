import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasManualEdit } from './tagReviewUtils';
import {
  applyAffectedToLocalTags,
  rowsMissingSuggestions,
  useTagActions,
} from './useTagReviewActions';

import type { ConfirmedTransaction, SuggestedTag, TagRuleImpactItem } from '@pops/finance';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function makeTransaction(checksum: string, suggested: string[]): ConfirmedTransaction {
  return {
    date: '2026-03-01',
    description: `TXN ${checksum}`,
    amount: -12.5,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
    tags: [...suggested],
    suggestedTags: suggested.map((tag) => ({ tag, source: 'ai' })),
  };
}

function metaFor(transactions: ConfirmedTransaction[]): Record<string, SuggestedTag[]> {
  return Object.fromEntries(transactions.map((t) => [t.checksum, t.suggestedTags ?? []]));
}

function impact(transactionId: string, tags: string[]): TagRuleImpactItem {
  return {
    transactionId,
    description: `TXN ${transactionId}`,
    before: { suggestedTags: [] },
    after: { suggestedTags: tags.map((tag) => ({ tag, source: 'rule' as const })) },
  };
}

/**
 * Drives useTagActions over real state, the way useTagReviewState wires it:
 * localTags is state, suggestedTagMeta is the (fixed) suggestion baseline.
 */
function renderTagActions(
  transactions: ConfirmedTransaction[],
  suggestedTagMeta = metaFor(transactions)
) {
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

beforeEach(() => {
  toastMock.success.mockReset();
  toastMock.info.mockReset();
  toastMock.error.mockReset();
});

describe('hasManualEdit', () => {
  it('is false for a row whose tags equal its suggestions regardless of order', () => {
    expect(
      hasManualEdit(
        ['Transport', 'Groceries'],
        [
          { tag: 'Groceries', source: 'ai' },
          { tag: 'Transport', source: 'rule' },
        ]
      )
    ).toBe(false);
  });

  it('is false for a row edited back to exactly its suggestion set', () => {
    const suggested: SuggestedTag[] = [{ tag: 'Groceries', source: 'ai' }];
    expect(hasManualEdit([], suggested)).toBe(true);
    expect(hasManualEdit(['Groceries'], suggested)).toBe(false);
  });

  it('is true when a tag was added or removed', () => {
    const suggested: SuggestedTag[] = [{ tag: 'Groceries', source: 'ai' }];
    expect(hasManualEdit(['Groceries', 'Mine'], suggested)).toBe(true);
    expect(hasManualEdit(['Mine'], suggested)).toBe(true);
  });

  it('does not treat a duplicated tag as an edit', () => {
    expect(hasManualEdit(['Groceries', 'Groceries'], [{ tag: 'Groceries', source: 'ai' }])).toBe(
      false
    );
  });
});

describe('rowsMissingSuggestions', () => {
  it('is empty for the initial state, where tags already equal the suggestions', () => {
    const txns = [makeTransaction('a', ['Groceries']), makeTransaction('b', ['Subscriptions'])];
    expect(
      rowsMissingSuggestions(txns, { a: ['Groceries'], b: ['Subscriptions'] }, metaFor(txns))
    ).toEqual([]);
  });

  it('lists only rows missing a suggested tag, not rows with extra manual tags', () => {
    const txns = [makeTransaction('a', ['Groceries']), makeTransaction('b', ['Subscriptions'])];
    expect(
      rowsMissingSuggestions(txns, { a: [], b: ['Subscriptions', 'Mine'] }, metaFor(txns))
    ).toEqual(['a']);
  });

  it('ignores rows with no suggestions at all', () => {
    const txns = [makeTransaction('a', [])];
    expect(rowsMissingSuggestions(txns, { a: [] }, metaFor(txns))).toEqual([]);
  });
});

describe('useTagActions — handleAcceptAll', () => {
  it('preserves manual edits: a removed suggestion returns, an added tag survives', () => {
    const txns = [makeTransaction('a', ['Groceries'])];
    const { result } = renderTagActions(txns);

    act(() => result.current.updateTag('a', ['Mine']));
    expect(result.current.localTags.a).toEqual(['Mine']);

    act(() => result.current.handleAcceptAll());
    expect(result.current.localTags.a).toEqual(['Mine', 'Groceries']);
  });

  it('leaves untouched rows alone and never drops a manually added tag', () => {
    const txns = [makeTransaction('a', ['Groceries']), makeTransaction('b', ['Subscriptions'])];
    const { result } = renderTagActions(txns);

    act(() => result.current.updateTag('b', ['Subscriptions', 'Mine']));
    act(() => result.current.handleAcceptAll());

    expect(result.current.localTags.a).toEqual(['Groceries']);
    expect(result.current.localTags.b).toEqual(['Subscriptions', 'Mine']);
  });

  it('is inert when no row is missing a suggestion', () => {
    const txns = [makeTransaction('a', ['Groceries'])];
    const { result } = renderTagActions(txns);

    expect(result.current.unappliedSuggestionCount).toBe(0);
    act(() => result.current.handleAcceptAll());
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('reports how many rows it changed', () => {
    const txns = [makeTransaction('a', ['Groceries']), makeTransaction('b', ['Subscriptions'])];
    const { result } = renderTagActions(txns);

    act(() => result.current.updateTag('a', []));
    expect(result.current.unappliedSuggestionCount).toBe(1);

    act(() => result.current.handleAcceptAll());
    expect(toastMock.success).toHaveBeenCalledWith('Suggested tags applied to 1 transaction');
  });

  it('does not block a later rule from reaching rows it reset', () => {
    const txns = [makeTransaction('a', ['Groceries'])];
    const { result } = renderTagActions(txns);

    act(() => result.current.updateTag('a', []));
    act(() => result.current.handleAcceptAll());

    const next = applyAffectedToLocalTags(
      result.current.localTags,
      [impact('a', ['Supermarket'])],
      metaFor(txns)
    );
    expect(next.a).toEqual(['Groceries', 'Supermarket']);
  });
});

describe('applyAffectedToLocalTags', () => {
  it('skips rows that genuinely differ from their suggestions', () => {
    const txns = [makeTransaction('a', ['Groceries'])];
    const next = applyAffectedToLocalTags(
      { a: ['Groceries', 'Mine'] },
      [impact('a', ['Supermarket'])],
      metaFor(txns)
    );
    expect(next.a).toEqual(['Groceries', 'Mine']);
  });

  it('applies to rows whose tags match their suggestions', () => {
    const txns = [makeTransaction('a', ['Groceries'])];
    const next = applyAffectedToLocalTags(
      { a: ['Groceries'] },
      [impact('a', ['Supermarket'])],
      metaFor(txns)
    );
    expect(next.a).toEqual(['Groceries', 'Supermarket']);
  });
});
