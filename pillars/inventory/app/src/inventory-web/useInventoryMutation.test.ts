import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ syncMutations: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  syncMutations: (...args: unknown[]) => mocks.syncMutations(...args),
}));

import { WEB_ITEMS_QUERY_KEY, webItemDetailQueryKey } from './queryKeys';
import { createTestQueryClient, withQueryClient } from './test-utils';
import { useInventoryMutation } from './useInventoryMutation';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useInventoryMutation', () => {
  it('resolves with the outcome the server returned', async () => {
    mocks.syncMutations.mockResolvedValue(
      ok({
        outcomes: [{ mutationId: 'm1', status: 'applied', revision: 2, seq: 1, converged: false }],
        highWaterSeq: 1,
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useInventoryMutation(), {
      wrapper: withQueryClient(client),
    });

    let outcome: unknown;
    await waitFor(async () => {
      outcome = await result.current.mutateAsync({
        command: { op: 'item.setFull', args: { full: true } },
        entityId: 'item-1',
        baseRevision: 1,
      });
    });

    expect(outcome).toMatchObject({ status: 'applied' });
  });

  it('invalidates the web items list and that item detail on settle, applied or not', async () => {
    mocks.syncMutations.mockResolvedValue(
      ok({
        outcomes: [
          { mutationId: 'm1', status: 'rejected', reason: 'invalid_lifecycle', message: 'no' },
        ],
        highWaterSeq: 1,
      })
    );
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useInventoryMutation(), {
      wrapper: withQueryClient(client),
    });

    await result.current.mutateAsync({
      command: { op: 'item.delete', args: {} },
      entityId: 'item-7',
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: WEB_ITEMS_QUERY_KEY });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: webItemDetailQueryKey('item-7') });
    });
  });

  it('rejects when the transport call fails', async () => {
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'client too old' },
      response: { status: 426 },
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useInventoryMutation(), {
      wrapper: withQueryClient(client),
    });

    await expect(
      result.current.mutateAsync({ command: { op: 'item.delete', args: {} }, entityId: 'item-1' })
    ).rejects.toMatchObject({ status: 426 });
  });
});
