import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  recordPlacement: vi.fn(),
  syncMutations: vi.fn(),
  useCatalogue: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  syncMutations: (...args: unknown[]) => mocks.syncMutations(...args),
}));

vi.mock('./recents.js', () => ({
  recordPlacement: (...args: unknown[]) => mocks.recordPlacement(...args),
}));

vi.mock('./useCatalogueLookups.js', () => ({
  useCatalogue: mocks.useCatalogue,
}));

import { InventoryApiError } from '../inventory-api-helpers.js';
import { useItemVerbs } from './item-verbs';
import { BulkUndoRefusedError, useBulkItemVerbs } from './item-verbs-bulk';
import { optimisticItemsFor } from './optimistic-items.js';
import { WEB_ITEMS_QUERY_KEY } from './queryKeys.js';
import { createTestQueryClient, withQueryClient } from './test-utils';

import type { WebListResponses } from '../inventory-api/types.gen.js';
import type { FieldValuePatch } from './commands.js';

type WebItem = WebListResponses['200']['items'][number];
type MutationRequest = {
  body: {
    mutations: Array<{
      args: Record<string, unknown>;
      entityId: string;
      mutationId: string;
      op: string;
    }>;
  };
};

const baseItem: WebItem = {
  access: 'closed',
  catalogueRevision: null,
  code: null,
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item-0',
  isContainer: true,
  isFull: false,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Item',
  note: null,
  photos: [],
  placement: { kind: 'location', locationId: 'old-room' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function item(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, id, name: id, ...overrides };
}

function seedItems(queryClient: QueryClient, items: readonly WebItem[]): void {
  queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50], {
    pages: [
      {
        hiddenInactiveCount: 0,
        items,
        nextCursor: null,
        total: items.length,
        unfilteredTotal: items.length,
      },
    ],
    pageParams: [undefined],
  });
}

function cachedItems(queryClient: QueryClient): WebItem[] {
  const data = queryClient.getQueryData<{
    pages: Array<{ items: WebItem[] }>;
  }>([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50]);
  return data?.pages[0]?.items ?? [];
}

function ok(outcomes: readonly unknown[]) {
  return { data: { outcomes, highWaterSeq: 200 }, error: undefined, response: { status: 200 } };
}

function applied(mutationId: string, revision: number, seq: number) {
  return { mutationId, status: 'applied', revision, seq, converged: false };
}

function requestAt(index = 0): MutationRequest {
  const request = mocks.syncMutations.mock.calls[index]?.[0] as MutationRequest | undefined;
  if (request === undefined) throw new Error(`missing sync request ${String(index)}`);
  return request;
}

function outcomesForCurrentBatch(startSeq: number, refusedId?: string): unknown[] {
  const request = requestAt(mocks.syncMutations.mock.calls.length - 1);
  return request.body.mutations.map((mutation, index) =>
    mutation.entityId === refusedId
      ? { mutationId: mutation.mutationId, status: 'deferred', waitingOn: 'other-device' }
      : applied(mutation.mutationId, startSeq + index, startSeq + index)
  );
}

function deferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('resolver not ready');
      resolvePromise(value);
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useCatalogue.mockReturnValue({
    data: {
      revision: { revision: 7 },
      types: [{ id: 'type-cable', key: 'cable' }],
    },
  });
});

describe('bulk item verbs', () => {
  it('dedupes ids in first-occurrence order and resolves an empty list without sending', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    mocks.syncMutations.mockResolvedValue(ok([applied('m1', 2, 10)]));
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(
      result.current.move([], { kind: 'location', locationId: 'new-room' })
    ).resolves.toEqual({ applied: [], refused: [], undo: null });
    const moved = await result.current.move(['item-1', 'item-1'], {
      kind: 'location',
      locationId: 'new-room',
    });

    expect(moved.applied).toEqual(['item-1']);
    expect(requestAt().body.mutations.map(({ entityId }) => entityId)).toEqual(['item-1']);
  });

  it('rejects before patching or sending when any item is not loaded', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(
      result.current.move(['item-1', 'missing'], { kind: 'location', locationId: 'new-room' })
    ).rejects.toThrow('item missing is not loaded');
    expect(cachedItems(queryClient)[0]?.placement).toEqual({
      kind: 'location',
      locationId: 'old-room',
    });
    expect(optimisticItemsFor(queryClient).pendingIds()).toEqual(new Set());
    expect(mocks.syncMutations).not.toHaveBeenCalled();
  });

  it('does not leave an invalidation hold after preflight refusals', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    mocks.syncMutations.mockResolvedValue(ok([applied('m1', 2, 10)]));
    const { result } = renderHook(() => ({ bulk: useBulkItemVerbs(), single: useItemVerbs() }), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(
      result.current.bulk.move(['missing'], { kind: 'location', locationId: 'new-room' })
    ).rejects.toThrow('item missing is not loaded');
    await expect(result.current.bulk.changeType(['item-1'], 'unknown')).rejects.toThrow(
      'unknown type unknown'
    );
    await expect(
      result.current.single.move('item-1', { kind: 'location', locationId: 'new-room' })
    ).resolves.toMatchObject({ status: 'applied' });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
  });

  it('patches all rows before sending 120 ids in 50, 50 and 20 batches', async () => {
    const queryClient = createTestQueryClient();
    const items = Array.from({ length: 120 }, (_, index) => item(`item-${String(index)}`));
    seedItems(queryClient, items);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const first = deferred<ReturnType<typeof ok>>();
    const second = deferred<ReturnType<typeof ok>>();
    const third = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });
    const movePromise = result.current.move(
      items.map(({ id }) => id),
      {
        kind: 'location',
        locationId: 'new-room',
      }
    );

    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(1));
    expect(requestAt().body.mutations).toHaveLength(50);
    expect(
      cachedItems(queryClient).every(
        (entry) => entry.placement.kind === 'location' && entry.placement.locationId === 'new-room'
      )
    ).toBe(true);
    expect(optimisticItemsFor(queryClient).pendingIds().size).toBe(120);
    expect(invalidate).not.toHaveBeenCalled();

    first.resolve(ok(outcomesForCurrentBatch(100, 'item-37')));
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(2));
    expect(requestAt(1).body.mutations).toHaveLength(50);
    expect(invalidate).not.toHaveBeenCalled();

    second.resolve(ok(outcomesForCurrentBatch(200)));
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(3));
    expect(requestAt(2).body.mutations).toHaveLength(20);
    expect(invalidate).not.toHaveBeenCalled();

    third.resolve(ok(outcomesForCurrentBatch(300)));
    const bulk = await movePromise;
    expect(bulk.applied).toHaveLength(119);
    expect(bulk.applied).not.toContain('item-37');
    expect(bulk.refused).toEqual([
      {
        id: 'item-37',
        refusal: { kind: 'outcome', outcome: expect.objectContaining({ status: 'deferred' }) },
      },
    ]);
    expect(cachedItems(queryClient).find((entry) => entry.id === 'item-37')?.placement).toEqual({
      kind: 'location',
      locationId: 'old-room',
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('restores a failed batch and still sends the later batch', async () => {
    const queryClient = createTestQueryClient();
    const items = Array.from({ length: 60 }, (_, index) => item(`item-${String(index)}`));
    seedItems(queryClient, items);
    mocks.syncMutations
      .mockRejectedValueOnce(new InventoryApiError('offline', 503))
      .mockImplementationOnce((request: MutationRequest) =>
        ok(
          request.body.mutations.map((mutation, index) =>
            applied(mutation.mutationId, 200 + index, 200 + index)
          )
        )
      );
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const bulk = await result.current.move(
      items.map(({ id }) => id),
      {
        kind: 'location',
        locationId: 'new-room',
      }
    );

    expect(mocks.syncMutations).toHaveBeenCalledTimes(2);
    expect(bulk.applied).toHaveLength(10);
    expect(bulk.refused).toHaveLength(50);
    expect(bulk.refused[0]).toMatchObject({
      id: 'item-0',
      refusal: { kind: 'failed', error: { status: 503 } },
    });
    expect(
      cachedItems(queryClient)
        .slice(0, 50)
        .every(
          (entry) =>
            entry.placement.kind === 'location' && entry.placement.locationId === 'old-room'
        )
    ).toBe(true);
  });

  it('waits for an earlier single-item verb before sending the bulk command', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    const singleResponse = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations
      .mockReturnValueOnce(singleResponse.promise)
      .mockResolvedValueOnce(ok([applied('m2', 3, 12)]));
    const { result } = renderHook(() => ({ bulk: useBulkItemVerbs(), single: useItemVerbs() }), {
      wrapper: withQueryClient(queryClient),
    });

    const single = result.current.single.setFull('item-1', true);
    const bulk = result.current.bulk.move(['item-1'], {
      kind: 'location',
      locationId: 'new-room',
    });
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(1));
    expect(requestAt().body.mutations[0]?.op).toBe('item.setFull');
    expect(cachedItems(queryClient)[0]).toMatchObject({
      isFull: true,
      placement: { kind: 'location', locationId: 'new-room' },
    });

    singleResponse.resolve(ok([applied('m1', 2, 11)]));
    await expect(single).resolves.toMatchObject({ status: 'applied' });
    await expect(bulk).resolves.toMatchObject({ applied: ['item-1'] });
    expect(requestAt(1).body.mutations[0]).toMatchObject({
      op: 'item.move',
      baseRevision: 2,
    });
  });

  it('puts each item back to its own previous place and reports a stranded item', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [
      item('item-1', {
        placement: { kind: 'hand' },
        previousPlacement: { kind: 'location', locationId: 'room-a' },
      }),
      item('item-2', {
        placement: { kind: 'hand' },
        previousPlacement: { kind: 'container', itemId: 'box-a' },
      }),
      item('item-3', { placement: { kind: 'hand' }, previousPlacement: null }),
    ]);
    mocks.syncMutations.mockImplementation((request: MutationRequest) =>
      ok(
        request.body.mutations.map((mutation, index) => applied(mutation.mutationId, 2, index + 10))
      )
    );
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const bulk = await result.current.putBack(['item-1', 'item-2', 'item-3']);

    expect(requestAt().body.mutations.map(({ args }) => args)).toEqual([
      { to: { kind: 'location', locationId: 'room-a' }, verb: 'put_back' },
      { to: { kind: 'container', itemId: 'box-a' }, verb: 'put_back' },
    ]);
    expect(bulk.refused).toEqual([{ id: 'item-3', refusal: { kind: 'no-previous-place' } }]);
    expect(mocks.recordPlacement.mock.calls).toEqual([
      [{ kind: 'location', locationId: 'room-a' }],
      [{ kind: 'container', containerId: 'box-a' }],
    ]);
  });

  it('sends lifecycle reason identically for every item and records a move once', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1'), item('item-2')]);
    mocks.syncMutations.mockImplementation((request: MutationRequest) =>
      ok(
        request.body.mutations.map((mutation, index) => applied(mutation.mutationId, 2, index + 10))
      )
    );
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current.setLifecycle(['item-1', 'item-2'], 'retired', 'moving house');
    expect(requestAt().body.mutations.map(({ args }) => args)).toEqual([
      { lifecycle: 'retired', reason: 'moving house' },
      { lifecycle: 'retired', reason: 'moving house' },
    ]);

    mocks.syncMutations.mockReset();
    mocks.syncMutations.mockResolvedValue(ok([applied('m3', 3, 20), applied('m4', 3, 21)]));
    await result.current.move(['item-1', 'item-2'], {
      kind: 'location',
      locationId: 'new-room',
    });
    expect(mocks.recordPlacement).toHaveBeenCalledTimes(1);
  });

  it('changes type with stable ids and leaves rows unchanged until the refetch', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    const response = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations.mockReturnValue(response.promise);
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });
    const values = [{ fieldId: 'field-1', values: ['blue'] }] as const;

    const pending = result.current.changeType(['item-1'], 'cable', values);
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(1));
    expect(cachedItems(queryClient)[0]?.typeId).toBeNull();
    expect(optimisticItemsFor(queryClient).pendingIds()).toEqual(new Set(['item-1']));
    expect(requestAt().body.mutations[0]).toMatchObject({
      op: 'item.changeType',
      catalogueRevision: 7,
      args: { typeId: 'type-cable', values },
    });

    response.resolve(ok([applied('m1', 2, 10)]));
    await expect(pending).resolves.toMatchObject({ applied: ['item-1'] });
  });

  it('sends each selected item its own retained stable values', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1'), item('item-2')]);
    mocks.syncMutations.mockImplementation((request: MutationRequest) =>
      ok(
        request.body.mutations.map((mutation, index) => applied(mutation.mutationId, 2, index + 10))
      )
    );
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });
    const values = new Map<string, readonly { fieldId: string; values: readonly string[] }[]>([
      ['item-1', [{ fieldId: 'field-1', values: ['one'] }]],
      ['item-2', [{ fieldId: 'field-2', values: ['two'] }]],
    ]);

    await result.current.changeType(['item-1', 'item-2'], 'cable', values);

    expect(requestAt().body.mutations.map(({ args }) => args)).toEqual([
      { typeId: 'type-cable', values: [{ fieldId: 'field-1', values: ['one'] }] },
      { typeId: 'type-cable', values: [{ fieldId: 'field-2', values: ['two'] }] },
    ]);
  });

  it('sends each typed edit with its own values and skips empty writes', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1'), item('item-2')]);
    mocks.syncMutations.mockImplementation((request: MutationRequest) =>
      ok(
        request.body.mutations.map((mutation, index) => applied(mutation.mutationId, 2, index + 10))
      )
    );
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });
    const first: FieldValuePatch = { fieldId: 'field-1', values: ['one'] };
    const second: FieldValuePatch = { fieldId: 'field-2', values: [{ optionId: 'opt-2' }] };

    const bulk = await result.current.editValues([
      { id: 'item-1', patches: [first] },
      { id: 'item-1', patches: [second] },
      { id: 'item-2', patches: [] },
    ]);

    expect(bulk.applied).toEqual(['item-1']);
    expect(requestAt().body.mutations).toHaveLength(1);
    expect(requestAt().body.mutations[0]).toMatchObject({
      op: 'item.edit',
      entityId: 'item-1',
      catalogueRevision: 7,
      args: { values: [first] },
    });
  });

  it('does not send typed writes when the catalogue is unavailable', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    mocks.useCatalogue.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(
      result.current.editValues([
        { id: 'item-1', patches: [{ fieldId: 'field-1', values: ['one'] }] },
      ])
    ).rejects.toThrow('the published catalogue is not loaded');
    expect(mocks.syncMutations).not.toHaveBeenCalled();
  });

  it('undoes all applied ids in batches and reports a refused revert', async () => {
    const queryClient = createTestQueryClient();
    const items = Array.from({ length: 120 }, (_, index) => item(`item-${String(index)}`));
    seedItems(queryClient, items);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    mocks.syncMutations.mockImplementation((request: MutationRequest) =>
      ok(
        request.body.mutations.map((mutation, index) =>
          mutation.op === 'event.revert' && mutation.entityId === 'item-51'
            ? {
                mutationId: mutation.mutationId,
                status: 'deferred',
                waitingOn: 'changed-since',
              }
            : applied(mutation.mutationId, 2, index + 100)
        )
      )
    );
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });
    const bulk = await result.current.move(
      items.map(({ id }) => id),
      {
        kind: 'location',
        locationId: 'new-room',
      }
    );
    if (bulk.undo === null) throw new Error('bulk move did not return undo');
    invalidate.mockClear();

    await expect(bulk.undo()).rejects.toMatchObject({
      name: 'BulkUndoRefusedError',
      refused: [{ id: 'item-51', refusal: { kind: 'outcome' } }],
    });
    expect(
      mocks.syncMutations.mock.calls
        .slice(3)
        .map((call) => (call[0] as MutationRequest).body.mutations.length)
    ).toEqual([50, 50, 20]);
    expect(mocks.syncMutations.mock.calls[3]?.[0].body.mutations[0]).toMatchObject({
      op: 'event.revert',
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('waits for a pending single verb before sending undo', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    const singleResponse = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations
      .mockResolvedValueOnce(ok([applied('m1', 2, 10)]))
      .mockReturnValueOnce(singleResponse.promise)
      .mockResolvedValueOnce(ok([applied('m3', 4, 12)]));
    const { result } = renderHook(() => ({ bulk: useBulkItemVerbs(), single: useItemVerbs() }), {
      wrapper: withQueryClient(queryClient),
    });
    const bulk = await result.current.bulk.move(['item-1'], {
      kind: 'location',
      locationId: 'new-room',
    });
    if (bulk.undo === null) throw new Error('bulk move did not return undo');
    const single = result.current.single.setAccess('item-1', 'open');
    const undo = bulk.undo();

    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(2));
    expect(requestAt(1).body.mutations[0]?.op).toBe('item.setAccess');
    expect(
      mocks.syncMutations.mock.calls.some(
        (call) => (call[0] as MutationRequest).body.mutations[0]?.op === 'event.revert'
      )
    ).toBe(false);

    singleResponse.resolve(ok([applied('m2', 3, 11)]));
    await expect(single).resolves.toMatchObject({ status: 'applied' });
    await expect(undo).resolves.toBeUndefined();
    expect(requestAt(2).body.mutations[0]).toMatchObject({
      op: 'event.revert',
      args: { seq: 10 },
    });
  });

  it('optimistically changes access and returns an undo for a successful result', async () => {
    const queryClient = createTestQueryClient();
    seedItems(queryClient, [item('item-1')]);
    const response = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations.mockReturnValue(response.promise);
    const { result } = renderHook(() => useBulkItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const pending = result.current.setAccess(['item-1'], 'open');
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(1));
    expect(cachedItems(queryClient)[0]?.access).toBe('open');
    response.resolve(ok([applied('m1', 2, 10)]));
    const bulk = await pending;
    expect(bulk.undo).toEqual(expect.any(Function));
  });

  it('exposes the typed undo refusal error class', () => {
    const error = new BulkUndoRefusedError([
      { id: 'item-1', refusal: { kind: 'no-previous-place' } },
    ]);
    expect(error).toBeInstanceOf(Error);
    expect(error.refused).toEqual([{ id: 'item-1', refusal: { kind: 'no-previous-place' } }]);
  });
});
