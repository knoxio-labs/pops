import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  recordPlacement: vi.fn(),
  syncMutations: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  syncMutations: (...args: unknown[]) => mocks.syncMutations(...args),
}));

vi.mock('./recents.js', () => ({
  recordPlacement: (...args: unknown[]) => mocks.recordPlacement(...args),
}));

import { UndoRefusedError, useItemVerbs, usePendingItemIds, wirePlacement } from './item-verbs';
import { WEB_ITEMS_QUERY_KEY, webItemDetailQueryKey } from './queryKeys.js';
import { createTestQueryClient, withQueryClient } from './test-utils';

import type { WebListResponses } from '../inventory-api/types.gen.js';

type WebItem = WebListResponses['200']['items'][number];

const baseItem: WebItem = {
  access: 'closed',
  catalogueRevision: null,
  code: 'OLD',
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item-1',
  isContainer: true,
  isFull: false,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Item',
  note: 'Existing',
  photos: [],
  placement: { kind: 'location', locationId: 'old-room' },
  previousPlacement: null,
  provenance: null,
  quantity: 5,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function item(overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides };
}

function seedItem(queryClient: QueryClient, value: WebItem = item()): void {
  queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50], {
    pages: [
      {
        hiddenInactiveCount: 0,
        items: [value],
        nextCursor: null,
        total: 1,
        unfilteredTotal: 1,
      },
    ],
    pageParams: [undefined],
  });
  queryClient.setQueryData([...webItemDetailQueryKey(value.id), 50], {
    item: value,
    history: { events: [], nextCursor: null },
  });
}

function ok(outcomes: readonly unknown[]) {
  return { data: { outcomes, highWaterSeq: 20 }, error: undefined, response: { status: 200 } };
}

function applied(mutationId: string, revision: number, seq: number) {
  return { mutationId, status: 'applied', revision, seq, converged: false };
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

function firstMutation(index = 0): {
  readonly op: string;
  readonly entityId: string;
  readonly baseRevision: number | null;
  readonly args: Record<string, unknown>;
} {
  const call = mocks.syncMutations.mock.calls[index]?.[0];
  if (typeof call !== 'object' || call === null || !('body' in call)) {
    throw new Error('sync mutation was not called with a body');
  }
  const body = call.body;
  if (typeof body !== 'object' || body === null || !('mutations' in body)) {
    throw new Error('sync mutation body is missing mutations');
  }
  const mutations = body.mutations;
  if (!Array.isArray(mutations)) throw new Error('sync mutation body is malformed');
  const mutation = mutations[0];
  if (typeof mutation !== 'object' || mutation === null) {
    throw new Error('sync mutation envelope is missing');
  }
  if (
    typeof mutation.op !== 'string' ||
    typeof mutation.entityId !== 'string' ||
    !('baseRevision' in mutation) ||
    (typeof mutation.baseRevision !== 'number' && mutation.baseRevision !== null) ||
    typeof mutation.args !== 'object' ||
    mutation.args === null
  ) {
    throw new Error('sync mutation envelope is malformed');
  }
  return {
    op: mutation.op,
    entityId: mutation.entityId,
    baseRevision: mutation.baseRevision,
    args: mutation.args,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('item verbs', () => {
  it('move sends the wire target and cached revision while patching optimistically', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    const response = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations.mockReturnValue(response.promise);
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const move = result.current.move('item-1', { kind: 'container', containerId: 'box-1' });
    const list = queryClient.getQueryData<{
      pages: readonly [{ items: readonly [WebItem] }];
    }>([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50]);
    expect(list?.pages[0]?.items[0]?.placement).toEqual({ kind: 'container', itemId: 'box-1' });
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(1));
    expect(firstMutation()).toMatchObject({
      op: 'item.move',
      entityId: 'item-1',
      baseRevision: 1,
      args: { to: { kind: 'container', itemId: 'box-1' }, verb: 'move' },
    });

    response.resolve(ok([applied('m1', 2, 11)]));
    await expect(move).resolves.toMatchObject({ status: 'applied', seq: 11 });
  });

  it('a refused move restores both list and detail caches and returns the outcome', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    mocks.syncMutations.mockResolvedValue(
      ok([
        {
          mutationId: 'm1',
          status: 'conflict',
          kind: 'field',
          field: 'placement',
          mine: { kind: 'location', locationId: 'new-room' },
          theirs: { kind: 'location', locationId: 'old-room' },
          at: '2026-09-01T00:00:00.000Z',
          currentRevision: 2,
          source: { kind: 'web', label: 'Web' },
        },
      ])
    );
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const response = await result.current.move('item-1', {
      kind: 'location',
      locationId: 'new-room',
    });

    expect(response).toMatchObject({ status: 'refused', refusal: { kind: 'outcome' } });
    expect(
      queryClient.getQueryData<{ item: WebItem }>([...webItemDetailQueryKey('item-1'), 50])?.item
        .placement
    ).toEqual({ kind: 'location', locationId: 'old-room' });
  });

  it('a transport failure restores the optimistic copy and returns a failed refusal', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    mocks.syncMutations.mockResolvedValue({
      data: undefined,
      error: { message: 'offline' },
      response: { status: 503 },
    });
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const response = await result.current.setFull('item-1', true);

    expect(response).toMatchObject({
      status: 'refused',
      refusal: { kind: 'failed', error: { status: 503 } },
    });
    expect(
      queryClient.getQueryData<{ item: WebItem }>([...webItemDetailQueryKey('item-1'), 50])?.item
        .isFull
    ).toBe(false);
  });

  it('a second verb waits and uses the first verb acknowledgement revision', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    const firstResponse = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(ok([applied('m2', 3, 12)]));
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const first = result.current.setFull('item-1', true);
    const second = result.current.setAccess('item-1', 'open');
    await waitFor(() => expect(mocks.syncMutations).toHaveBeenCalledTimes(1));
    expect(
      queryClient.getQueryData<{ item: WebItem }>([...webItemDetailQueryKey('item-1'), 50])?.item
    ).toMatchObject({ isFull: true, access: 'open' });

    firstResponse.resolve(ok([applied('m1', 2, 11)]));
    await expect(first).resolves.toMatchObject({ status: 'applied' });
    await expect(second).resolves.toMatchObject({ status: 'applied' });
    expect(mocks.syncMutations).toHaveBeenCalledTimes(2);
    expect(firstMutation(1)).toMatchObject({ op: 'item.setAccess', baseRevision: 2 });
  });

  it('undo sends event.revert without a base revision', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    mocks.syncMutations
      .mockResolvedValueOnce(ok([applied('m1', 2, 41)]))
      .mockResolvedValueOnce(ok([applied('m2', 3, 42)]));
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const response = await result.current.move('item-1', {
      kind: 'location',
      locationId: 'new-room',
    });
    if (response.status !== 'applied' || response.undo === null) {
      throw new Error('move did not return undo');
    }
    await response.undo();

    expect(firstMutation(1)).toMatchObject({
      op: 'event.revert',
      entityId: 'item-1',
      baseRevision: null,
      args: { seq: 41 },
    });
  });

  it('undo rejects with UndoRefusedError when the revert is refused', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    mocks.syncMutations.mockResolvedValueOnce(ok([applied('m1', 2, 41)])).mockResolvedValueOnce(
      ok([
        {
          mutationId: 'm2',
          status: 'conflict',
          kind: 'field',
          field: 'placement',
          mine: { kind: 'location', locationId: 'old-room' },
          theirs: { kind: 'location', locationId: 'other-room' },
          at: '2026-09-01T00:00:00.000Z',
          currentRevision: 3,
          source: { kind: 'web', label: 'Web' },
        },
      ])
    );
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });
    const response = await result.current.move('item-1', {
      kind: 'location',
      locationId: 'new-room',
    });
    if (response.status !== 'applied' || response.undo === null) {
      throw new Error('move did not return undo');
    }

    await expect(response.undo()).rejects.toBeInstanceOf(UndoRefusedError);
  });

  it('split and destroy return no undo', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    mocks.syncMutations
      .mockResolvedValueOnce(ok([applied('m1', 2, 41)]))
      .mockResolvedValueOnce(ok([applied('m2', 3, 42)]));
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    const split = await result.current.split('item-1', 2);
    const destroy = await result.current.setLifecycle('item-1', 'destroyed', null);

    expect(split).toMatchObject({ status: 'applied', undo: null });
    expect(destroy).toMatchObject({ status: 'applied', undo: null });
  });

  it('setCode accepts null and edit sends a nullable note while patching blank notes to null', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    mocks.syncMutations
      .mockResolvedValueOnce(ok([applied('m1', 2, 41)]))
      .mockResolvedValueOnce(ok([applied('m2', 3, 42)]));
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current.setCode('item-1', null);
    await result.current.edit('item-1', { note: '' });

    expect(firstMutation(0)).toMatchObject({ op: 'item.setCode', args: { code: null } });
    expect(firstMutation(1)).toMatchObject({ op: 'item.edit', args: { note: '' } });
    expect(
      queryClient.getQueryData<{ item: WebItem }>([...webItemDetailQueryKey('item-1'), 50])?.item
    ).toMatchObject({ code: null, note: null });
  });

  it('records applied move and put-back targets but not refused or pick-up verbs', async () => {
    const queryClient = createTestQueryClient();
    seedItem(
      queryClient,
      item({
        placement: { kind: 'hand' },
        previousPlacement: { kind: 'location', locationId: 'old-room' },
      })
    );
    mocks.syncMutations
      .mockResolvedValueOnce(ok([applied('m1', 2, 41)]))
      .mockResolvedValueOnce(ok([applied('m2', 3, 42)]))
      .mockResolvedValueOnce(
        ok([
          {
            mutationId: 'm3',
            status: 'rejected',
            reason: 'invalid',
            message: 'no',
          },
        ])
      );
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current.move('item-1', { kind: 'location', locationId: 'new-room' });
    expect(mocks.recordPlacement).toHaveBeenCalledWith({
      kind: 'location',
      locationId: 'new-room',
    });
    mocks.recordPlacement.mockClear();

    await result.current.pickUp('item-1');
    expect(mocks.recordPlacement).not.toHaveBeenCalled();
    await result.current.move('item-1', { kind: 'location', locationId: 'refused-room' });
    expect(mocks.recordPlacement).not.toHaveBeenCalled();

    mocks.syncMutations.mockResolvedValueOnce(ok([applied('m4', 4, 44)]));
    await result.current.putBack('item-1');
    expect(mocks.recordPlacement).toHaveBeenCalledWith({
      kind: 'location',
      locationId: 'new-room',
    });
  });

  it('putBack refuses to send without a previous place and verbs reject for an unloaded item', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient, item({ placement: { kind: 'hand' }, previousPlacement: null }));
    mocks.syncMutations.mockResolvedValue(ok([applied('m1', 2, 41)]));
    const { result } = renderHook(() => useItemVerbs(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current.putBack('item-1')).rejects.toThrow(
      'item item-1 has no previous place'
    );
    await expect(
      result.current.move('missing', { kind: 'location', locationId: 'room' })
    ).rejects.toThrow('item missing is not loaded');
    expect(mocks.syncMutations).not.toHaveBeenCalled();
  });

  it('usePendingItemIds reflects a verb until its response settles', async () => {
    const queryClient = createTestQueryClient();
    seedItem(queryClient);
    const response = deferred<ReturnType<typeof ok>>();
    mocks.syncMutations.mockReturnValue(response.promise);
    const wrapper = withQueryClient(queryClient);
    const verbs = renderHook(() => useItemVerbs(), { wrapper });
    const pending = renderHook(() => usePendingItemIds(), { wrapper });

    let request: Promise<unknown>;
    act(() => {
      request = verbs.result.current.move('item-1', { kind: 'location', locationId: 'new-room' });
    });
    await waitFor(() => expect(pending.result.current).toEqual(new Set(['item-1'])));
    response.resolve(ok([applied('m1', 2, 41)]));
    await request!;
    await waitFor(() => expect(pending.result.current).toEqual(new Set()));
  });

  it('maps fixed placements to wire placements', () => {
    expect(wirePlacement({ kind: 'location', locationId: 'room' })).toEqual({
      kind: 'location',
      locationId: 'room',
    });
    expect(wirePlacement({ kind: 'container', containerId: 'box' })).toEqual({
      kind: 'container',
      itemId: 'box',
    });
  });
});
