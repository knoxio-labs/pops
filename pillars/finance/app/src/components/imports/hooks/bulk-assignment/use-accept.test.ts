/**
 * Regression test for CF014 (#3620) at the hook boundary: Accept-All must not
 * duplicate a matched card when invoked on a transaction that already lives
 * in the `matched` bucket (e.g. accepting the same group twice, or after a
 * prior manual assignment on one of its members).
 */
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../../store/importStore';
import { useAcceptAll } from './use-accept';

import type { EntityListResponse } from '../../../../contacts-api/index.js';
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
    entity: { entityName: 'Bunnings', matchType: 'ai', confidence: 0.8 },
    status: 'uncertain',
    ...overrides,
  };
}

function emptyState(overrides: Partial<LocalTxState> = {}): LocalTxState {
  return { matched: [], uncertain: [], failed: [], skipped: [], ...overrides };
}

beforeEach(() => {
  useImportStore.getState().reset();
});

describe('useAcceptAll (CF014)', () => {
  it('replaces the existing matched card in place instead of appending a duplicate', async () => {
    const dbEntitiesData: EntityListResponse = {
      data: [
        {
          id: 'ent-bunnings',
          name: 'Bunnings',
          aliases: [],
          defaultTags: [],
          type: 'company',
          lastEditedTime: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { hasMore: false, limit: 50, offset: 0, total: 1 },
    };

    const alreadyMatched = makeProcessed('bunnings', {
      status: 'matched',
      entity: {
        entityId: 'ent-bunnings',
        entityName: 'Bunnings',
        matchType: 'ai',
        confidence: 0.8,
      },
    });

    const { result } = renderHook(() => {
      const [state, setState] = useState<LocalTxState>(emptyState({ matched: [alreadyMatched] }));
      const acceptAll = useAcceptAll({
        entities: dbEntitiesData.data,
        addPendingEntity: useImportStore.getState().addPendingEntity,
        dbEntitiesData,
        setLocalTransactions: setState,
        generateProposal: vi.fn().mockResolvedValue(undefined),
      });
      return { state, acceptAll };
    });

    const incoming = makeProcessed('bunnings', {
      status: 'uncertain',
      entity: { entityName: 'Bunnings', matchType: 'ai', confidence: 0.8 },
    });

    await act(async () => {
      await result.current.acceptAll([incoming]);
    });

    expect(result.current.state.matched).toHaveLength(1);
    expect(result.current.state.matched[0]?.checksum).toBe('bunnings');
    expect(result.current.state.matched[0]?.entity).toMatchObject({
      entityId: 'ent-bunnings',
      entityName: 'Bunnings',
      matchType: 'manual',
    });
  });
});
