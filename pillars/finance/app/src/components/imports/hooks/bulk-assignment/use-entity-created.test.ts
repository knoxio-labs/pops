/**
 * Regression test for CF014 (#3620) at the hook boundary: creating an entity
 * for a whole group routes its assignment through `moveToMatched`, which must
 * dedupe by checksum instead of appending a duplicate matched card for a
 * transaction that is already in the `matched` bucket.
 */
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAssignCreatedToGroup, useEntityCreated } from './use-entity-created';

import type { ProcessedTransaction } from '../../../../store/importStore';
import type { LocalTxState } from './types';

function makeProcessed(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -20,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

function emptyState(overrides: Partial<LocalTxState> = {}): LocalTxState {
  return { matched: [], uncertain: [], failed: [], skipped: [], ...overrides };
}

function renderAssign(initial: LocalTxState) {
  const generateProposal = vi.fn().mockResolvedValue(undefined);
  const recomputeForEntity = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => {
    const [state, setState] = useState<LocalTxState>(initial);
    const assign = useAssignCreatedToGroup({
      setLocalTransactions: setState,
      generateProposal,
      recomputeForEntity,
    });
    return { state, assign };
  });
  return { hook, generateProposal, recomputeForEntity };
}

describe('useAssignCreatedToGroup (CF014)', () => {
  it('replaces an already-matched transaction instead of appending a duplicate', () => {
    const alreadyMatched = makeProcessed('woolies', {
      status: 'matched',
      entity: { entityName: 'Woolworths (old)', matchType: 'ai', confidence: 0.6 },
    });
    const group = [
      makeProcessed('woolies', { status: 'uncertain' }),
      makeProcessed('coles', { status: 'uncertain' }),
    ];
    const { hook } = renderAssign(emptyState({ matched: [alreadyMatched] }));

    act(() => {
      hook.result.current.assign(group, { entityId: 'ent-woolies', entityName: 'Woolworths' });
    });

    const { matched } = hook.result.current.state;
    expect(matched.filter((t) => t.checksum === 'woolies')).toHaveLength(1);
    expect(matched.map((t) => t.checksum).toSorted()).toEqual(['coles', 'woolies']);
    const woolies = matched.find((t) => t.checksum === 'woolies');
    expect(woolies?.entity).toMatchObject({ entityId: 'ent-woolies', entityName: 'Woolworths' });
  });

  it('seeds a correction proposal from the first transaction so the group earns a rule', () => {
    const group = [
      makeProcessed('a', { location: 'Darlinghurst', transactionType: 'purchase' }),
      makeProcessed('b'),
    ];
    const { hook, generateProposal } = renderAssign(emptyState());

    act(() => {
      hook.result.current.assign(group, { entityId: 'temp:entity:1', entityName: 'SaunaX' });
    });

    expect(generateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        triggeringTransaction: group[0],
        entityId: 'temp:entity:1',
        entityName: 'SaunaX',
        location: 'Darlinghurst',
        transactionType: 'purchase',
      })
    );
  });

  it('does nothing for an empty group', () => {
    const { hook, generateProposal } = renderAssign(emptyState());

    act(() => {
      hook.result.current.assign([], { entityId: 'e', entityName: 'E' });
    });

    expect(hook.result.current.state.matched).toHaveLength(0);
    expect(generateProposal).not.toHaveBeenCalled();
  });
});

describe('useEntityCreated — single-transaction dialog path', () => {
  it('assigns the created entity to the transaction the dialog was opened for', () => {
    const transaction = makeProcessed('a');
    const handleEntitySelect = vi.fn();
    const setSelectedTransaction = vi.fn();

    const { result } = renderHook(() =>
      useEntityCreated({
        selectedTransaction: transaction,
        setSelectedTransaction,
        handleEntitySelect,
      })
    );

    act(() => {
      result.current({ entityId: 'ent-1', entityName: 'SaunaX' });
    });

    expect(handleEntitySelect).toHaveBeenCalledWith(transaction, 'ent-1', 'SaunaX');
    expect(setSelectedTransaction).toHaveBeenCalledWith(null);
  });

  it('is inert when no transaction is selected', () => {
    const handleEntitySelect = vi.fn();
    const { result } = renderHook(() =>
      useEntityCreated({
        selectedTransaction: null,
        setSelectedTransaction: vi.fn(),
        handleEntitySelect,
      })
    );

    act(() => {
      result.current({ entityId: 'ent-1', entityName: 'SaunaX' });
    });

    expect(handleEntitySelect).not.toHaveBeenCalled();
  });
});
