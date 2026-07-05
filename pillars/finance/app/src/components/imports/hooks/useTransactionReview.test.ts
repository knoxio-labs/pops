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

import { type ChangeSet, useImportStore } from '../../../store/importStore';
import { useTransactionReview } from './useTransactionReview';

const sampleChangeSet: ChangeSet = {
  source: 'ai',
  reason: 'test',
  ops: [{ op: 'add', data: { descriptionPattern: 'TEST', matchType: 'exact' } }],
};

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
