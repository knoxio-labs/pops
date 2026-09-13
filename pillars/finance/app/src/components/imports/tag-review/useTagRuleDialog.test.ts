/**
 * The Tag Review step's "Save tag rule…" dialog must never propose a rule
 * carrying a marker-facet tag: the server refuses one, and the refusal rejects
 * the whole commit rather than the rule where it was staged (POPS-3704).
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTagRuleDialog } from './useTagRuleDialog';

import type { ConfirmedTransaction } from '@pops/finance';

import type { TagFacetOption } from '../../../lib/tags';

const toastMock = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const facets: TagFacetOption[] = [
  { facet: 'contains', kind: 'open' },
  { facet: 'person', kind: 'marker' },
  { facet: 'flag', kind: 'marker' },
];

function row(checksum: string): ConfirmedTransaction {
  return {
    date: '2026-09-01',
    description: 'GITHUB SPONSORS',
    amount: -10,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum,
    entityId: 'e1',
    entityName: 'GitHub',
  };
}

beforeEach(() => {
  toastMock.info.mockReset();
});

describe('useTagRuleDialog marker-facet tags', () => {
  it('stages a group rule with only the non-marker tags its rows carry', () => {
    const localTags = { a: ['person:x', 'contains:software'], b: ['flag:needs-review'] };
    const { result } = renderHook(() => useTagRuleDialog(localTags, facets));

    act(() => {
      result.current.handleOpenTagRuleDialog({
        entityName: 'GitHub',
        transactions: [row('a'), row('b')],
      });
    });

    expect(result.current.tagRuleDialog?.signal.tags).toEqual(['contains:software']);
  });

  it('offers no group rule when every tag on the rows is a marker', () => {
    const localTags = { a: ['person:x'], b: ['flag:needs-review'] };
    const { result } = renderHook(() => useTagRuleDialog(localTags, facets));

    act(() => {
      result.current.handleOpenTagRuleDialog({
        entityName: 'GitHub',
        transactions: [row('a'), row('b')],
      });
    });

    expect(result.current.tagRuleDialog).toBeNull();
    expect(toastMock.info).toHaveBeenCalledOnce();
  });

  it('stages a single-row rule without its marker tags, and offers none when only markers remain', () => {
    const { result } = renderHook(() => useTagRuleDialog({}, facets));

    act(() => {
      result.current.handleOpenTagRuleDialogForTransaction(row('a'), [
        'person:x',
        'contains:software',
      ]);
    });
    expect(result.current.tagRuleDialog?.signal.tags).toEqual(['contains:software']);

    act(() => {
      result.current.setTagRuleDialogOpen(false);
      result.current.handleOpenTagRuleDialogForTransaction(row('a'), ['PERSON:x']);
    });
    expect(result.current.tagRuleDialog).toBeNull();
    expect(toastMock.info).toHaveBeenCalledOnce();
  });
});
