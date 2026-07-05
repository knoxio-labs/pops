/**
 * Regression test for CF014 (#3620) at the hook boundary: Create-entity-for-all
 * routes its bulk assignment through `moveToMatched`, which must dedupe by
 * checksum instead of appending a duplicate matched card for a transaction
 * that is already in the `matched` bucket.
 */
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useEntityCreated } from './use-entity-created';

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

describe('useEntityCreated — bulk path (CF014)', () => {
  it('replaces an already-matched transaction instead of appending a duplicate', () => {
    const alreadyMatched = makeProcessed('woolies', {
      status: 'matched',
      entity: { entityName: 'Woolworths (old)', matchType: 'ai', confidence: 0.6 },
    });
    const pendingBulk = [
      makeProcessed('woolies', { status: 'uncertain' }),
      makeProcessed('coles', { status: 'uncertain' }),
    ];

    const { result } = renderHook(() => {
      const [state, setState] = useState<LocalTxState>(emptyState({ matched: [alreadyMatched] }));
      const [pendingBulkTransactions, setPendingBulkTransactions] = useState<
        ProcessedTransaction[] | null
      >(pendingBulk);
      const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(
        null
      );

      const entityCreated = useEntityCreated({
        pendingBulkTransactions,
        selectedTransaction,
        setLocalTransactions: setState,
        setPendingBulkTransactions,
        setSelectedTransaction,
        handleEntitySelect: vi.fn(),
        generateProposal: vi.fn().mockResolvedValue(undefined),
      });

      return { state, pendingBulkTransactions, entityCreated };
    });

    act(() => {
      result.current.entityCreated({ entityId: 'ent-woolies', entityName: 'Woolworths' });
    });

    const { matched } = result.current.state;
    expect(matched.filter((t) => t.checksum === 'woolies')).toHaveLength(1);
    expect(matched.map((t) => t.checksum).toSorted()).toEqual(['coles', 'woolies']);
    const woolies = matched.find((t) => t.checksum === 'woolies');
    expect(woolies?.entity).toMatchObject({ entityId: 'ent-woolies', entityName: 'Woolworths' });
    expect(result.current.pendingBulkTransactions).toBeNull();
  });
});
