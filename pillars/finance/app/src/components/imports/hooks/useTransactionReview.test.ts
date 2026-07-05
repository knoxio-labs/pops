import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reevaluateMock = vi.hoisted(() => vi.fn());
vi.mock('../../../finance-api/index.js', () => ({
  importsReevaluateWithPendingRules: (...args: unknown[]) => reevaluateMock(...args),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import {
  type ChangeSet,
  type ProcessedTransaction,
  useImportStore,
} from '../../../store/importStore';
import { useTransactionReview } from './useTransactionReview';

const sampleChangeSet: ChangeSet = {
  source: 'ai',
  reason: 'test',
  ops: [{ op: 'add', data: { descriptionPattern: 'TEST', matchType: 'exact' } }],
};

function makeTx(
  checksum: string,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-02-06',
    description: `TXN ${checksum}`,
    amount: -12.5,
    account: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
    entity: { matchType: 'none' },
    status: 'uncertain',
    ...overrides,
  };
}

/**
 * The client is configured to retry mutations aggressively so that a missing
 * per-mutation `retry: false` would replay the request (and fail the call-count
 * assertion) rather than passing by accident.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 5, retryDelay: 0 },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
  useImportStore.getState().setProcessSessionId('11111111-1111-1111-1111-111111111111');
});

afterEach(() => {
  useImportStore.getState().reset();
});

describe('useTransactionReview — reevaluate retry storm', () => {
  it('does not retry a failed re-evaluation and surfaces a single error', async () => {
    reevaluateMock.mockRejectedValue(new Error('404 Not Found'));

    const { wrapper } = makeWrapper();
    renderHook(() => useTransactionReview(), { wrapper });

    // Changing the pending change sets after mount triggers a re-evaluation.
    act(() => {
      useImportStore.getState().addPendingChangeSet({
        changeSet: sampleChangeSet,
        source: 'correction-proposal',
      });
    });

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));

    // Even though the client would retry 5×, the mutation opts out: exactly one
    // request and one error toast — no console/flood storm.
    expect(reevaluateMock).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith(
      'Failed to re-evaluate transactions against updated rules'
    );
  });

  it('re-evaluates once per pending change set mutation', async () => {
    reevaluateMock.mockResolvedValue({
      data: { result: { matched: [], uncertain: [], failed: [], skipped: [] }, affectedCount: 0 },
      error: undefined,
    });

    const { wrapper } = makeWrapper();
    renderHook(() => useTransactionReview(), { wrapper });

    act(() => {
      useImportStore.getState().addPendingChangeSet({
        changeSet: sampleChangeSet,
        source: 'correction-proposal',
      });
    });

    await waitFor(() => expect(reevaluateMock).toHaveBeenCalledTimes(1));
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

describe('useTransactionReview — manual edits survive a ChangeSet reevaluate (#3610)', () => {
  it('keeps a locally-resolved transaction instead of letting the stale server reevaluation revert it', async () => {
    const uncertainTx = makeTx('resolved-1');
    useImportStore.getState().setProcessedTransactions({
      matched: [],
      uncertain: [uncertainTx],
      failed: [],
      skipped: [],
    });

    const resolvedTx: ProcessedTransaction = {
      ...uncertainTx,
      status: 'matched',
      entity: { entityId: 'ent-1', entityName: 'Resolved Co', matchType: 'manual' },
      manuallyEdited: true,
    };

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactionReview(), { wrapper });

    // The user manually resolves the uncertain row before the reevaluate fires.
    act(() => {
      result.current.setLocalTransactions((prev) => ({
        ...prev,
        uncertain: prev.uncertain.filter((t) => t.checksum !== 'resolved-1'),
        matched: [...prev.matched, resolvedTx],
      }));
    });

    expect(result.current.localTransactions.matched).toEqual([resolvedTx]);

    // The server has no idea the row was resolved locally and reprocesses it
    // from scratch, coming back with it still uncertain.
    reevaluateMock.mockResolvedValue({
      data: {
        result: { matched: [], uncertain: [uncertainTx], failed: [], skipped: [] },
        affectedCount: 0,
      },
      error: undefined,
    });

    act(() => {
      useImportStore.getState().addPendingChangeSet({
        changeSet: sampleChangeSet,
        source: 'correction-proposal',
      });
    });

    await waitFor(() => expect(reevaluateMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.localTransactions.matched).toEqual([resolvedTx]));
    expect(result.current.localTransactions.uncertain).toEqual([]);
    expect(useImportStore.getState().processedTransactions.matched).toEqual([resolvedTx]);
  });
});

describe('useTransactionReview — manual edits survive Back-then-Next remounts (#3610)', () => {
  it('persists a local resolution into the store so a remounted hook reads it back', () => {
    const uncertainTx = makeTx('resolved-2');
    useImportStore.getState().setProcessedTransactions({
      matched: [],
      uncertain: [uncertainTx],
      failed: [],
      skipped: [],
    });

    const resolvedTx: ProcessedTransaction = {
      ...uncertainTx,
      status: 'matched',
      entity: { entityId: 'ent-2', entityName: 'Resolved Co', matchType: 'manual' },
      manuallyEdited: true,
    };

    const { wrapper } = makeWrapper();
    const first = renderHook(() => useTransactionReview(), { wrapper });

    act(() => {
      first.result.current.setLocalTransactions((prev) => ({
        ...prev,
        uncertain: prev.uncertain.filter((t) => t.checksum !== 'resolved-2'),
        matched: [...prev.matched, resolvedTx],
      }));
    });

    // Simulates navigating away (ReviewStep unmounts, its local state is gone)
    // and back (a fresh ReviewStep mounts, re-running this hook from scratch).
    first.unmount();

    const second = renderHook(() => useTransactionReview(), { wrapper });

    expect(second.result.current.localTransactions.matched).toEqual([resolvedTx]);
    expect(second.result.current.localTransactions.uncertain).toEqual([]);
  });
});
