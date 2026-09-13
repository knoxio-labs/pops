import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEntityGroupState } from './useEntityGroupState';

import type { ConfirmedTransaction, SuggestedTag } from '@pops/finance';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function makeTransaction(checksum: string): ConfirmedTransaction {
  return {
    date: '2026-09-01',
    description: 'SQ *PALMS ON OXFORD',
    amount: -42,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
  };
}

function render(localTags: Record<string, string[]>, suggested: Record<string, SuggestedTag[]>) {
  const onUpdateTag = vi.fn();
  const transactions = Object.keys(localTags).map(makeTransaction);
  const { result } = renderHook(() =>
    useEntityGroupState({
      group: { entityName: 'Palms', transactions },
      localTags,
      suggestedTagMeta: suggested,
      onUpdateTag,
      onApplyGroupTags: vi.fn(),
      onRemoveGroupTag: vi.fn(),
    })
  );
  return { result, onUpdateTag };
}

describe('useEntityGroupState — handleApplySuggestions (POPS-3668)', () => {
  it('replaces the row’s venue with the suggested one instead of adding a second', () => {
    const { result, onUpdateTag } = render(
      { a: ['venue:takeaway', 'contains:food'] },
      {
        a: [
          { tag: 'venue:restaurant', source: 'rule' },
          { tag: 'contains:alcohol', source: 'rule' },
        ],
      }
    );

    act(() => result.current.handleApplySuggestions());
    expect(onUpdateTag).toHaveBeenCalledWith('a', [
      'contains:food',
      'venue:restaurant',
      'contains:alcohol',
    ]);
  });

  it('skips a row whose suggestions are already all applied', () => {
    const { result, onUpdateTag } = render(
      { a: ['venue:pub'] },
      { a: [{ tag: 'venue:pub', source: 'rule' }] }
    );

    act(() => result.current.handleApplySuggestions());
    expect(onUpdateTag).not.toHaveBeenCalled();
  });
});
