import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { LocationTreeNode } from '../inventory-api/types.gen.js';
import type { LocationTreeCache } from './location-tree-cache';

const mocks = vi.hoisted(() => ({
  locationsCreate: vi.fn(),
  locationsDelete: vi.fn(),
  locationsUpdate: vi.fn(),
  useBulkItemVerbs: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  locationsCreate: (...args: unknown[]) => mocks.locationsCreate(...args),
  locationsDelete: (...args: unknown[]) => mocks.locationsDelete(...args),
  locationsUpdate: (...args: unknown[]) => mocks.locationsUpdate(...args),
}));

vi.mock('./item-verbs-bulk.js', () => ({
  useBulkItemVerbs: () => mocks.useBulkItemVerbs(),
}));

import { LOCATIONS_TREE_QUERY_KEY } from './queryKeys';
import { usePlaceMutations } from './usePlaceMutations';

function node(
  id: string,
  parentId: string | null,
  sortOrder: number,
  children: LocationTreeNode[] = []
): LocationTreeNode {
  return { id, name: id, parentId, sortOrder, children };
}

function tree(data: LocationTreeNode[]): LocationTreeCache {
  return { data };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function deferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('resolver is not ready');
      resolvePromise(value);
    },
  };
}

function seed(queryClient: ReturnType<typeof createTestQueryClient>, value: LocationTreeCache) {
  queryClient.setQueryData(LOCATIONS_TREE_QUERY_KEY, value);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locationsCreate.mockResolvedValue(
    ok({
      data: { id: 'created', name: 'Created', parentId: 'room', sortOrder: 2 },
      message: 'Location created',
    })
  );
  mocks.locationsDelete.mockResolvedValue(ok({ message: 'Location deleted' }));
  mocks.locationsUpdate.mockResolvedValue(ok({ data: { id: 'updated' } }));
  mocks.useBulkItemVerbs.mockReturnValue({ move: vi.fn() });
});

describe('usePlaceMutations', () => {
  it('create posts the trimmed name, appends the new place and resolves its id', async () => {
    const client = createTestQueryClient();
    seed(
      client,
      tree([node('room', null, 0, [node('attic', 'room', 0), node('zebra', 'room', 1)])])
    );
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    const created = await act(() => result.current.create('  Bench  ', 'room'));

    expect(created.id).toBe('created');
    expect(mocks.locationsCreate).toHaveBeenCalledWith({
      body: { name: 'Bench', parentId: 'room', sortOrder: 2 },
    });
    expect(
      client.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY)?.data[0]?.children
    ).toEqual([
      node('attic', 'room', 0),
      node('zebra', 'room', 1),
      { ...node('created', 'room', 2), name: 'Created' },
    ]);
  });

  it("create's undo deletes without force and rejects when the place is no longer empty", async () => {
    const client = createTestQueryClient();
    seed(client, tree([node('room', null, 0)]));
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });
    const created = await act(() => result.current.create('New place', 'room'));
    mocks.locationsDelete.mockResolvedValueOnce(
      ok({
        requiresConfirmation: true,
        stats: { childCount: 0, descendantCount: 0, itemCount: 1, totalItemCount: 1 },
      })
    );

    await expect(created.undo()).rejects.toThrow('place is no longer empty');
    expect(mocks.locationsDelete).toHaveBeenCalledWith({ path: { id: 'created' } });
  });

  it('rename updates the tree cache at once and restores it on failure', async () => {
    const pending = deferred<unknown>();
    mocks.locationsUpdate.mockReturnValueOnce(pending.promise);
    const client = createTestQueryClient();
    seed(client, tree([node('room', null, 0)]));
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    const renamePromise = result.current.rename('room', 'Renamed');
    await waitFor(() =>
      expect(client.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY)?.data[0]?.name).toBe(
        'Renamed'
      )
    );
    pending.resolve({ error: { message: 'rename failed' }, response: { status: 500 } });

    await expect(renamePromise).rejects.toThrow('rename failed');
    expect(client.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY)).toEqual(
      tree([node('room', null, 0)])
    );
  });

  it('move sends parentId with the next sortOrder and its undo sends the previous ones', async () => {
    const client = createTestQueryClient();
    seed(
      client,
      tree([
        node('moving', null, 0),
        node('target', null, 1, [node('existing', 'target', 0), node('last', 'target', 1)]),
      ])
    );
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    const moved = await act(() => result.current.move('moving', 'target'));

    expect(mocks.locationsUpdate).toHaveBeenNthCalledWith(1, {
      path: { id: 'moving' },
      body: { parentId: 'target', sortOrder: 2 },
    });
    expect(
      client.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY)?.data[0]?.children
    ).toEqual([
      node('existing', 'target', 0),
      node('last', 'target', 1),
      node('moving', 'target', 2),
    ]);

    await act(async () => moved.undo());
    expect(mocks.locationsUpdate).toHaveBeenNthCalledWith(2, {
      path: { id: 'moving' },
      body: { parentId: null, sortOrder: 0 },
    });
  });

  it('arrange writes only the places whose order changed and undo restores them last first', async () => {
    const client = createTestQueryClient();
    seed(client, tree([node('a', null, 0), node('b', null, 1), node('c', null, 2)]));
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    const arranged = await act(() => result.current.arrange('b', null, ['b', 'a', 'c']));

    expect(mocks.locationsUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.locationsUpdate).toHaveBeenNthCalledWith(1, {
      path: { id: 'b' },
      body: { parentId: null, sortOrder: 0 },
    });
    expect(mocks.locationsUpdate).toHaveBeenNthCalledWith(2, {
      path: { id: 'a' },
      body: { sortOrder: 1 },
    });

    await act(async () => arranged.undo());
    expect(mocks.locationsUpdate).toHaveBeenNthCalledWith(3, {
      path: { id: 'a' },
      body: { parentId: null, sortOrder: 0 },
    });
    expect(mocks.locationsUpdate).toHaveBeenNthCalledWith(4, {
      path: { id: 'b' },
      body: { parentId: null, sortOrder: 1 },
    });
  });

  it('rejects an arrange that does not contain the moved place without sending', async () => {
    const client = createTestQueryClient();
    seed(client, tree([node('a', null, 0)]));
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    await expect(result.current.arrange('missing', null, ['a'])).rejects.toThrow(
      'order must contain the place'
    );
    expect(mocks.locationsUpdate).not.toHaveBeenCalled();
  });

  it('a reparent removal moves the direct things to the parent before deleting with force', async () => {
    const bulkMove = vi.fn().mockResolvedValue({ applied: ['thing'], refused: [], undo: null });
    mocks.useBulkItemVerbs.mockReturnValue({ move: bulkMove });
    const client = createTestQueryClient();
    seed(
      client,
      tree([
        node('house', null, 0, [
          node('garage', 'house', 0, [node('shelf', 'garage', 0)]),
          node('office', 'house', 1),
        ]),
      ])
    );
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    await act(() =>
      result.current.remove({
        placeId: 'garage',
        mode: 'reparent',
        parentId: 'house',
        subtreeIds: ['garage', 'shelf'],
        thingIds: ['thing'],
      })
    );

    expect(bulkMove).toHaveBeenCalledWith(['thing'], { kind: 'location', locationId: 'house' });
    expect(mocks.locationsDelete).toHaveBeenCalledWith({
      path: { id: 'garage' },
      query: { force: true },
    });
    expect(
      client.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY)?.data[0]?.children
    ).toEqual([node('shelf', 'house', 0), node('office', 'house', 1)]);
  });

  it('a to-hand removal deletes the subtree deepest first with force', async () => {
    const client = createTestQueryClient();
    seed(client, tree([node('garage', null, 0, [node('shelf', 'garage', 0)])]));
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    await act(() =>
      result.current.remove({
        placeId: 'garage',
        mode: 'to-hand',
        parentId: null,
        subtreeIds: ['garage', 'shelf', 'bin'],
        thingIds: [],
      })
    );

    expect(mocks.locationsDelete.mock.calls.map(([request]) => request)).toEqual([
      { path: { id: 'bin' }, query: { force: true } },
      { path: { id: 'shelf' }, query: { force: true } },
      { path: { id: 'garage' }, query: { force: true } },
    ]);
  });

  it('a failed delete restores the tree and rejects', async () => {
    mocks.locationsDelete.mockRejectedValueOnce(new Error('delete failed'));
    const client = createTestQueryClient();
    const original = tree([node('garage', null, 0)]);
    seed(client, original);
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    await expect(
      result.current.remove({
        placeId: 'garage',
        mode: 'to-hand',
        parentId: null,
        subtreeIds: ['garage'],
        thingIds: [],
      })
    ).rejects.toThrow('delete failed');
    expect(client.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY)).toEqual(original);
  });

  it('every mutation and undo invalidates the locations and web queries once when it settles', async () => {
    const client = createTestQueryClient();
    seed(client, tree([node('room', null, 0)]));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePlaceMutations(), {
      wrapper: withQueryClient(client),
    });

    const renamed = await act(() => result.current.rename('room', 'New name'));
    await act(async () => renamed.undo());

    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: ['inventory', 'locations'] });
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ['inventory', 'web'] });
    expect(invalidate).toHaveBeenNthCalledWith(3, { queryKey: ['inventory', 'locations'] });
    expect(invalidate).toHaveBeenNthCalledWith(4, { queryKey: ['inventory', 'web'] });
  });
});
