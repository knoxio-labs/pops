import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_MUTATION_BATCH } from '@pops/inventory';

import { InventoryApiError } from '../inventory-api-helpers.js';
import { createTestQueryClient, withQueryClient } from './test-utils.js';
import { useDeleteCreated } from './useDeleteCreated.js';

import type { syncMutations } from '../inventory-api/index.js';
import type { SyncMutationsData, SyncMutationsResponses } from '../inventory-api/types.gen.js';

type MutationOutcome = SyncMutationsResponses[200]['outcomes'][number];
type MutationRequest = NonNullable<Parameters<typeof syncMutations>[0]>;
type MutationBody = NonNullable<SyncMutationsData['body']>;
type MutationResult = Awaited<ReturnType<typeof syncMutations>>;
type SyncMutationsMock = (request?: MutationRequest) => Promise<MutationResult>;

const mocks = vi.hoisted(() => ({
  syncMutations: vi.fn<SyncMutationsMock>(),
}));

vi.mock('../inventory-api/index.js', () => ({
  syncMutations: mocks.syncMutations,
}));

function ok(outcomes: readonly MutationOutcome[]): MutationResult {
  return {
    data: { outcomes: [...outcomes], highWaterSeq: 100 },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

function applied(mutationId: string, index: number): MutationOutcome {
  return {
    mutationId,
    status: 'applied',
    revision: index + 2,
    seq: index + 1,
    converged: false,
  };
}

function deferred(mutationId: string): MutationOutcome {
  return { mutationId, status: 'deferred', waitingOn: 'other-device' };
}

function requestBody(request: MutationRequest | undefined): MutationBody {
  if (request?.body === undefined) throw new Error('missing mutation request body');
  return request.body;
}

function requests(): MutationBody[] {
  return mocks.syncMutations.mock.calls.map(([request]) => requestBody(request));
}

function appliedFor(request: MutationRequest | undefined): MutationOutcome[] {
  return requestBody(request).mutations.map((mutation, index) =>
    applied(mutation.mutationId, index)
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useDeleteCreated', () => {
  it('deletes ids with base revision 1 in consecutive mutation batches', async () => {
    mocks.syncMutations.mockImplementation(async (request) => ok(appliedFor(request)));
    const ids = Array.from({ length: 120 }, (_, index) => `item-${index}`);
    const { result } = renderHook(() => useDeleteCreated(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await expect(result.current(ids)).resolves.toEqual({ removed: ids, kept: [] });

    const calls = requests();
    expect(calls.map((request) => request.mutations.length)).toEqual([50, 50, 20]);
    expect(
      calls
        .flatMap((request) => request.mutations)
        .every((mutation) => {
          return (
            mutation.op === 'item.delete' &&
            mutation.entityId.startsWith('item-') &&
            mutation.baseRevision === 1 &&
            mutation.args !== undefined &&
            mutation.args !== null &&
            typeof mutation.args === 'object' &&
            Object.keys(mutation.args).length === 0
          );
        })
    ).toBe(true);
  });

  it('deduplicates ids and lists refused outcomes as kept', async () => {
    mocks.syncMutations.mockResolvedValue(ok([applied('m1', 0), deferred('m2')]));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteCreated(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current(['item-1', 'item-2', 'item-1'])).resolves.toEqual({
      removed: ['item-1'],
      kept: ['item-2'],
    });
    expect(requests()).toHaveLength(1);
    expect(requests()[0]?.mutations).toHaveLength(2);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('keeps a failed batch and still sends every later batch', async () => {
    const ids = Array.from({ length: MAX_MUTATION_BATCH * 2 + 20 }, (_, index) => `item-${index}`);
    mocks.syncMutations
      .mockRejectedValueOnce(new InventoryApiError('offline', 503))
      .mockImplementation(async (request) => ok(appliedFor(request)));
    const { result } = renderHook(() => useDeleteCreated(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await expect(result.current(ids)).resolves.toEqual({
      removed: ids.slice(MAX_MUTATION_BATCH),
      kept: ids.slice(0, MAX_MUTATION_BATCH),
    });
    expect(requests()).toHaveLength(3);
    expect(requests().map((request) => request.mutations.length)).toEqual([50, 50, 20]);
  });

  it('invalidates once when a deletion succeeds and not when all ids are kept', async () => {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    mocks.syncMutations
      .mockResolvedValueOnce(ok([applied('m1', 0)]))
      .mockResolvedValueOnce(ok([deferred('m2')]));
    const { result } = renderHook(() => useDeleteCreated(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current(['removed']);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });

    invalidate.mockClear();
    await result.current(['kept']);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('returns an empty result without sending or invalidating', async () => {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteCreated(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current([])).resolves.toEqual({ removed: [], kept: [] });
    expect(mocks.syncMutations).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('rethrows programming errors instead of treating them as refused deletions', async () => {
    const unexpectedOutcome: MutationOutcome = {
      mutationId: 'm1',
      get status(): 'applied' {
        throw new Error('unexpected mutation invariant');
      },
      revision: 2,
      seq: 1,
      converged: false,
    };
    mocks.syncMutations.mockResolvedValue(ok([unexpectedOutcome]));
    const { result } = renderHook(() => useDeleteCreated(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await expect(result.current(['item-1'])).rejects.toThrow('unexpected mutation invariant');
  });
});
