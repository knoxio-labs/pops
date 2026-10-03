import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildDecision, useBatchSelection } from './useBatchSelection';

import type { ActionsPart, BatchAction } from '../chat-hooks/message-parts';

const actions: BatchAction[] = [
  { actionId: 'a1', tool: 'inventory.items.move', summary: 'Move drill', status: 'pending' },
  { actionId: 'a2', tool: 'finance.budgets.create', summary: 'Create budget', status: 'pending' },
  { actionId: 'a3', tool: 'inventory.items.move', summary: 'Move wrench', status: 'pending' },
];

function makePart(batchId = 'batch-1'): ActionsPart {
  return { type: 'actions', batchId, actions };
}

describe('buildDecision', () => {
  it('preserves action order when splitting approvals and rejections', () => {
    expect(buildDecision(actions, new Set(['a3', 'a1']), new Set())).toEqual({
      approve: ['a1', 'a3'],
      reject: ['a2'],
      alwaysAllow: [],
    });
  });

  it('includes allowed tools only when at least one action for that tool is ticked', () => {
    expect(
      buildDecision(
        actions,
        new Set(['a3']),
        new Set(['finance.budgets.create', 'inventory.items.move'])
      )
    ).toEqual({
      approve: ['a3'],
      reject: ['a1', 'a2'],
      alwaysAllow: ['inventory.items.move'],
    });
  });

  it('keeps allowed tools in their first action appearance order', () => {
    const orderedActions: BatchAction[] = [
      { actionId: 'a1', tool: 'tool-a', summary: 'A1', status: 'pending' },
      { actionId: 'b1', tool: 'tool-b', summary: 'B1', status: 'pending' },
      { actionId: 'a2', tool: 'tool-a', summary: 'A2', status: 'pending' },
      { actionId: 'b2', tool: 'tool-b', summary: 'B2', status: 'pending' },
    ];

    expect(
      buildDecision(orderedActions, new Set(['b1', 'a2']), new Set(['tool-b', 'tool-a']))
        .alwaysAllow
    ).toEqual(['tool-a', 'tool-b']);
  });

  it('preserves resolved outcomes while deciding the remaining pending actions', () => {
    const mixedActions: BatchAction[] = [
      { actionId: 'p1', tool: 'tool-pending', summary: 'Pending', status: 'pending' },
      { actionId: 'c1', tool: 'tool-confirmed', summary: 'Confirmed', status: 'confirmed' },
      { actionId: 'e1', tool: 'tool-executed', summary: 'Executed', status: 'executed' },
      { actionId: 'r1', tool: 'tool-rejected', summary: 'Rejected', status: 'rejected' },
      { actionId: 'f1', tool: 'tool-failed', summary: 'Failed', status: 'failed' },
    ];

    expect(buildDecision(mixedActions, new Set(['p1']), new Set())).toEqual({
      approve: ['p1', 'c1', 'e1', 'f1'],
      reject: ['r1'],
      alwaysAllow: [],
    });
    expect(buildDecision(mixedActions, new Set(), new Set())).toEqual({
      approve: ['c1', 'e1', 'f1'],
      reject: ['p1', 'r1'],
      alwaysAllow: [],
    });
  });
});

describe('useBatchSelection', () => {
  it('starts pending actions checked and toggles action and tool membership', () => {
    const { result } = renderHook(() => useBatchSelection(makePart()));

    expect(result.current.ticked).toEqual(new Set(['a1', 'a2', 'a3']));
    expect(result.current.alwaysAllow).toEqual(new Set());
    expect(result.current.tools).toEqual(['inventory.items.move', 'finance.budgets.create']);

    act(() => {
      result.current.toggleAction('a2');
      result.current.toggleTool('inventory.items.move');
    });

    expect(result.current.ticked).toEqual(new Set(['a1', 'a3']));
    expect(result.current.alwaysAllow).toEqual(new Set(['inventory.items.move']));
  });

  it('resets selection when a different batch is rendered', () => {
    const { result, rerender } = renderHook(({ part }) => useBatchSelection(part), {
      initialProps: { part: makePart() },
    });

    act(() => {
      result.current.toggleAction('a2');
      result.current.toggleTool('inventory.items.move');
    });
    rerender({ part: makePart('batch-2') });

    expect(result.current.ticked).toEqual(new Set(['a1', 'a2', 'a3']));
    expect(result.current.alwaysAllow).toEqual(new Set());
  });
});
