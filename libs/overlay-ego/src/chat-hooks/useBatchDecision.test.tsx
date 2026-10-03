import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '../test-utils';
import { useBatchDecision } from './useBatchDecision';

import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({ egoDecideActionBatch: vi.fn() }));

vi.mock('../ego-api', () => api);

let queryClient: ReturnType<typeof createTestQueryClient>;

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const decision = {
  approve: ['a1', 'a3'],
  reject: ['a2'],
  alwaysAllow: ['inventory.items.move'],
};

function renderDecision(onDecided = vi.fn(), conversationId: string | null = 'conversation-1') {
  return renderHook(() => useBatchDecision(conversationId, onDecided), { wrapper: Wrapper });
}

beforeEach(() => {
  api.egoDecideActionBatch.mockReset().mockResolvedValue({ data: {} });
  queryClient = createTestQueryClient();
});

describe('useBatchDecision', () => {
  it('records the decision, awaits both invalidations, then notifies the caller', async () => {
    const conversationInvalidation = deferred<void>();
    const listInvalidation = deferred<void>();
    const invalidations = [conversationInvalidation, listInvalidation];
    let invalidationIndex = 0;
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => {
      const invalidation = invalidations[invalidationIndex++];
      return invalidation?.promise ?? Promise.resolve();
    });
    const onDecided = vi.fn();
    const { result } = renderDecision(onDecided);
    let decisionPromise: Promise<void> = Promise.resolve();

    act(() => {
      decisionPromise = result.current.decide('b1', decision);
    });

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(2));
    expect(api.egoDecideActionBatch).toHaveBeenCalledTimes(1);
    expect(api.egoDecideActionBatch).toHaveBeenCalledWith({
      path: { batchId: 'b1' },
      body: decision,
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['ego', 'conversations', 'get', { id: 'conversation-1' }],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['ego', 'conversations', 'list'],
    });
    expect(onDecided).not.toHaveBeenCalled();

    await act(async () => {
      conversationInvalidation.resolve(undefined);
      listInvalidation.resolve(undefined);
      await decisionPromise;
    });

    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith('b1');
  });

  it('ignores a second decision while the first request is pending', async () => {
    const request = deferred<{ data: object }>();
    api.egoDecideActionBatch.mockReturnValueOnce(request.promise);
    const { result } = renderDecision();
    let firstDecision: Promise<void> = Promise.resolve();

    act(() => {
      firstDecision = result.current.decide('b1', decision);
    });

    await waitFor(() => expect(result.current.decidingBatchId).toBe('b1'));
    await act(async () => {
      await result.current.decide('b2', decision);
    });
    expect(api.egoDecideActionBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve({ data: {} });
      await firstDecision;
    });
    expect(result.current.decidingBatchId).toBeNull();
  });

  it('exposes API errors, skips invalidation on failure, and clears an old error on retry', async () => {
    api.egoDecideActionBatch.mockResolvedValueOnce({ error: { message: 'gateway down' } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const onDecided = vi.fn();
    const { result } = renderDecision(onDecided);

    await act(async () => {
      await result.current.decide('b1', decision);
    });

    expect(result.current.error).toBe('gateway down');
    expect(result.current.decidingBatchId).toBeNull();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(onDecided).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.decide('b2', decision);
    });

    expect(result.current.error).toBeNull();
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(onDecided).toHaveBeenCalledWith('b2');
  });

  it('ignores a decision when there is no conversation', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const onDecided = vi.fn();
    const { result } = renderDecision(onDecided, null);

    await act(async () => {
      await result.current.decide('b1', decision);
    });

    expect(api.egoDecideActionBatch).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(onDecided).not.toHaveBeenCalled();
  });
});
