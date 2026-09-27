import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from '../../inventory-web/test-utils.js';
import { deepContents, buildWorld } from '../model/placement-model.js';
import { useStoreHere } from './use-store-here.js';

import type { WebListResponses } from '../../inventory-api/types.gen.js';
import type { BatchRun } from '../../inventory-web/useBatchCreate.js';
import type { ItemRowModel, LocationModel, StoreHereTarget } from '../model/contracts.js';

const mocks = vi.hoisted(() => ({
  usePlacementSources: vi.fn(),
  useItemRows: vi.fn(),
  useWebSearch: vi.fn(),
  useBulkItemVerbs: vi.fn(),
  useItemVerbs: vi.fn(),
  useBatchCreate: vi.fn(),
  useCatalogueLookups: vi.fn(),
  useOnline: vi.fn(),
  webList: vi.fn(),
  showUndoToast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));
vi.mock('../../inventory-web/useWebItems.js', () => ({ useItemRows: mocks.useItemRows }));
vi.mock('../../inventory-web/useWebSearch.js', () => ({ useWebSearch: mocks.useWebSearch }));
vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: mocks.useBulkItemVerbs,
}));
vi.mock('../../inventory-web/item-verbs.js', () => ({
  useItemVerbs: mocks.useItemVerbs,
  wirePlacement: (
    to: { kind: 'container'; containerId: string } | { kind: 'location'; locationId: string }
  ) =>
    to.kind === 'container'
      ? { kind: 'container', itemId: to.containerId }
      : { kind: 'location', locationId: to.locationId },
}));
vi.mock('../../inventory-web/useBatchCreate.js', () => ({ useBatchCreate: mocks.useBatchCreate }));
vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));
vi.mock('../../inventory-web/useOnline.js', () => ({ useOnline: mocks.useOnline }));
vi.mock('../../inventory-api/index.js', () => ({ webList: mocks.webList }));
vi.mock('../feedback/undo-toast.js', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import type { PlacementWorld } from '../model/placement-model.js';

type WebItem = WebListResponses['200']['items'][number];
type WebListPage = WebListResponses['200'] & {
  readonly deletedPreviousPlaces?: Readonly<
    Record<string, { readonly kind: 'location' | 'container'; readonly name: string }>
  >;
};

const target: StoreHereTarget = {
  kind: 'container',
  id: 'target-box',
  name: 'Kitchen 13',
  state: 'open',
};

const targetRow = row(
  'target-box',
  'Kitchen 13',
  { kind: 'location', locationId: 'kitchen' },
  {
    container: { access: 'open', full: false },
  }
);
const kitchen: LocationModel = { id: 'kitchen', name: 'Kitchen', parentId: null, kind: 'room' };

function row(
  id: string,
  name: string,
  placement: ItemRowModel['placement'] = { kind: 'in-hand' },
  overrides: Partial<ItemRowModel> = {}
): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement,
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function itemRows(rows: ItemRowModel[], status: 'pending' | 'error' | 'success' = 'success') {
  return {
    rows,
    total: rows.length,
    unfilteredTotal: rows.length,
    hiddenInactiveCount: 0,
    baseline: rows.length,
    hidden: 0,
    contentCounts: {},
    status,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function placementWorld(items: ItemRowModel[] = [targetRow]): PlacementWorld {
  return buildWorld(items, [kitchen]);
}

function searchResults(exact: ItemRowModel | null = null, items: ItemRowModel[] = []) {
  return {
    exact,
    items: items.map((item) => ({
      kind: 'item' as const,
      item,
      tier: 'contains' as const,
      field: null,
    })),
    places: [],
    total: items.length + (exact === null ? 0 : 1),
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function webItem(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return {
    access: null,
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
    id,
    isContainer: false,
    isFull: null,
    legacyType: null,
    lifecycle: 'active',
    lifecycleChangedAt: null,
    name: id,
    note: null,
    photos: [],
    placement: { kind: 'container', itemId: 'target-box' },
    previousPlacement: null,
    provenance: null,
    quantity: 1,
    revision: 1,
    seq: 1,
    typeId: null,
    typeKey: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(overrides: Partial<WebListPage> = {}): WebListPage {
  return {
    contentCounts: {},
    hiddenInactiveCount: 0,
    items: [],
    nextCursor: null,
    total: 0,
    unfilteredTotal: 0,
    ...overrides,
  };
}

function renderStore(targetValue: StoreHereTarget = target, queryClient = createTestQueryClient()) {
  return renderHook(() => useStoreHere(targetValue), {
    wrapper: withQueryClient(queryClient),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useOnline.mockReturnValue(true);
  mocks.useCatalogueLookups.mockReturnValue({ typeNameById: new Map() });
  mocks.usePlacementSources.mockReturnValue({
    world: placementWorld(),
    isError: false,
    isLoading: false,
  });
  mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
    itemRows(placementKind === 'hand' ? [] : [targetRow])
  );
  mocks.useWebSearch.mockReturnValue({
    results: searchResults(),
    status: 'idle',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });
  mocks.useBulkItemVerbs.mockReturnValue({ store: vi.fn() });
  mocks.useItemVerbs.mockReturnValue({ setAccess: vi.fn() });
  mocks.useBatchCreate.mockReturnValue({ commit: vi.fn(), isRunning: false });
  mocks.webList.mockResolvedValue(ok(page()));
});

describe('useStoreHere', () => {
  it('lists in-hand rows first, then active rows by name, and omits the target', async () => {
    const handRows = [row('hand-a', 'Apple'), row('hand-z', 'Zebra')];
    const allRows = [
      targetRow,
      row('item-c', 'Cable'),
      row('hand-a', 'Apple'),
      row('hand-z', 'Zebra'),
    ];
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      placementKind === 'hand' ? itemRows(handRows) : itemRows(allRows)
    );

    const { result } = renderStore();

    await waitFor(() => expect(result.current.candidates).toHaveLength(3));
    expect(result.current.candidates.map((candidate) => candidate.item.id)).toEqual([
      'hand-a',
      'hand-z',
      'item-c',
    ]);
    expect(mocks.useItemRows).toHaveBeenNthCalledWith(
      1,
      { placementKind: 'hand', sort: 'name' },
      50
    );
    expect(mocks.useItemRows).toHaveBeenNthCalledWith(2, { sort: 'name' }, 50);
  });

  it('debounces search for 200ms and keeps exact results first', async () => {
    vi.useFakeTimers();
    try {
      const exact = row('exact', 'Cable');
      const contains = row('contains', 'Cable ties');
      mocks.useWebSearch.mockImplementation(({ q }: { q: string }) => ({
        results: q === 'cable' ? searchResults(exact, [contains]) : searchResults(),
        status: q === '' ? 'idle' : 'success',
        error: null,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      }));
      const { result } = renderStore();

      act(() => result.current.setQuery('cable'));
      expect(mocks.useWebSearch.mock.calls.some(([params]) => params.q === 'cable')).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(199);
      });
      expect(mocks.useWebSearch.mock.calls.some(([params]) => params.q === 'cable')).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.candidates.map((candidate) => candidate.item.id)).toEqual([
        'exact',
        'contains',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the candidate list empty when the server has no search hits', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderStore();
      act(() => result.current.setQuery('missing'));
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.candidates).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts a selected container contents read in the placement world', async () => {
    const box = row(
      'box',
      'Box',
      { kind: 'location', locationId: 'kitchen' },
      {
        container: { access: 'open', full: false },
      }
    );
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      itemRows(placementKind === 'hand' ? [] : [box])
    );
    mocks.usePlacementSources.mockReturnValue({
      world: placementWorld([targetRow, box]),
      isError: false,
      isLoading: false,
    });
    mocks.webList.mockResolvedValue(
      ok(
        page({
          items: [
            webItem('inside', {
              name: 'Inside box',
              placement: { kind: 'container', itemId: 'box' },
            }),
          ],
          total: 1,
          unfilteredTotal: 1,
        })
      )
    );
    const { result } = renderStore();

    act(() => result.current.toggle('box'));
    await waitFor(() => expect(result.current.world.items.has('inside')).toBe(true));
    expect(deepContents(result.current.world, 'box').map((item) => item.id)).toEqual(['inside']);
    expect(mocks.webList).toHaveBeenCalledWith({
      query: { within: 'box', limit: 200 },
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps a selected item in the world after the query changes', async () => {
    const selected = row('one', 'One');
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      itemRows(placementKind === 'hand' ? [selected] : [targetRow, selected])
    );
    const { result } = renderStore();

    act(() => result.current.toggle('one'));
    expect(result.current.selected).toEqual(new Set(['one']));

    vi.useFakeTimers();
    try {
      act(() => result.current.setQuery('missing'));
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.selected).toEqual(new Set(['one']));
      expect(result.current.world.items.has('one')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stores selected rows with one bulk request and one Undo toast', async () => {
    const selectedRows = [row('one', 'One'), row('two', 'Two'), row('three', 'Three')];
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      itemRows(placementKind === 'hand' ? selectedRows : [targetRow, ...selectedRows])
    );
    const undo = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const store = vi
      .fn()
      .mockResolvedValue({ applied: ['one', 'two', 'three'], refused: [], undo });
    mocks.useBulkItemVerbs.mockReturnValue({ store });
    const { result } = renderStore();

    act(() => {
      result.current.toggle('one');
      result.current.toggle('two');
      result.current.toggle('three');
    });
    await act(async () => {
      await result.current.store(selectedRows);
    });

    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith(['one', 'two', 'three'], {
      kind: 'container',
      containerId: 'target-box',
    });
    expect(mocks.showUndoToast).toHaveBeenCalledWith({
      concept: 'move',
      message: 'Stored 3 items in Kitchen 13.',
      onUndo: undo,
    });
    expect(result.current.selected).toEqual(new Set());
  });

  it('keeps every refused selection and reports its refusal', async () => {
    const selected = row('one', 'One');
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      itemRows(placementKind === 'hand' ? [selected] : [targetRow, selected])
    );
    mocks.useBulkItemVerbs.mockReturnValue({
      store: vi.fn().mockResolvedValue({
        applied: [],
        refused: [
          {
            id: 'one',
            refusal: {
              kind: 'outcome',
              outcome: { status: 'rejected', message: 'The item changed while you were here.' },
            },
          },
        ],
        undo: null,
      }),
    });
    const { result } = renderStore();
    act(() => result.current.toggle('one'));

    await act(async () => {
      await result.current.store([selected]);
    });

    expect(result.current.selected).toEqual(new Set(['one']));
    expect(mocks.toastError).toHaveBeenCalledWith('The item changed while you were here.');
  });

  it('reports a rejected store and keeps its selection', async () => {
    const selected = row('one', 'One');
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      itemRows(placementKind === 'hand' ? [selected] : [targetRow, selected])
    );
    mocks.useBulkItemVerbs.mockReturnValue({
      store: vi.fn().mockRejectedValue(new Error('item one is not loaded')),
    });
    const { result } = renderStore();
    act(() => result.current.toggle('one'));

    await act(async () => {
      await result.current.store([selected]);
    });

    expect(result.current.selected).toEqual(new Set(['one']));
    expect(mocks.toastError).toHaveBeenCalledWith('item one is not loaded');
  });

  it('creates into the target with an empty quantity cell and reports validation', async () => {
    const commit = vi
      .fn()
      .mockResolvedValueOnce({ outcomes: [{ status: 'created', row: 0, itemId: 'new-item' }] })
      .mockResolvedValueOnce({
        outcomes: [
          {
            status: 'invalid',
            row: 0,
            issues: [
              { code: 'name.required', column: 'name', message: 'Name is required.' },
              { code: 'type.required', column: 'type', message: 'Type is required.' },
            ],
          },
        ],
      });
    mocks.useBatchCreate.mockReturnValue({ commit, isRunning: false });
    const { result } = renderStore();

    await act(async () => {
      await expect(result.current.create('Milk frother')).resolves.toBe(true);
    });
    expect(commit).toHaveBeenNthCalledWith(
      1,
      [{ code: '', name: 'Milk frother', note: '', quantity: '', type: '', where: '' }],
      { kind: 'container', itemId: 'target-box' }
    );
    expect(result.current.created).toEqual(['Milk frother']);

    await act(async () => {
      await expect(result.current.create('Unnamed')).resolves.toBe(false);
    });
    expect(result.current.createError).toBe('Name is required. Type is required.');
  });

  it('creates into a place destination', async () => {
    const commit = vi.fn().mockResolvedValue({
      outcomes: [{ status: 'created', row: 0, itemId: 'new-item' }],
    });
    mocks.useBatchCreate.mockReturnValue({ commit, isRunning: false });
    const placeTarget: StoreHereTarget = { kind: 'location', id: 'kitchen', name: 'Kitchen' };
    const { result } = renderStore(placeTarget);

    await act(async () => {
      await result.current.create('Milk frother');
    });

    expect(commit).toHaveBeenCalledWith(
      [{ code: '', name: 'Milk frother', note: '', quantity: '', type: '', where: '' }],
      { kind: 'location', locationId: 'kitchen' }
    );
  });

  it('reports a not-sent create with the service error copy', async () => {
    const commit = vi.fn().mockResolvedValue({
      outcomes: [{ status: 'not-sent', row: 0, error: new Error('service unavailable') }],
    });
    mocks.useBatchCreate.mockReturnValue({ commit, isRunning: false });
    const { result } = renderStore();

    await act(async () => {
      await expect(result.current.create('Unavailable')).resolves.toBe(false);
    });

    expect(result.current.createError).toBe('Not saved. The inventory service did not answer.');
  });

  it('does not send a second create while the first commit is busy', async () => {
    let resolveCommit: ((value: BatchRun) => void) | undefined;
    const commitPromise = new Promise<BatchRun>((resolve) => {
      resolveCommit = resolve;
    });
    const commit = vi.fn().mockReturnValue(commitPromise);
    mocks.useBatchCreate.mockReturnValue({ commit, isRunning: false });
    const { result } = renderStore();

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.create('First');
    });
    expect(result.current.busy).toBe(true);

    let second = true;
    await act(async () => {
      second = await result.current.create('Second');
    });
    expect(second).toBe(false);
    expect(commit).toHaveBeenCalledOnce();

    await act(async () => {
      resolveCommit?.({ outcomes: [{ status: 'created', row: 0, itemId: 'first' }] });
      await first;
    });
    expect(result.current.busy).toBe(false);
  });

  it('opens a closed target with one Undo toast', async () => {
    const closedTarget: StoreHereTarget = {
      ...target,
      id: 'closed-box',
      name: 'Office 04',
      state: 'closed',
    };
    const undo = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const setAccess = vi.fn().mockResolvedValue({ status: 'applied', seq: 9, undo });
    mocks.useItemVerbs.mockReturnValue({ setAccess });
    const { result } = renderStore(closedTarget);

    await act(async () => {
      await result.current.openTarget();
    });

    expect(setAccess).toHaveBeenCalledWith('closed-box', 'open');
    expect(mocks.showUndoToast).toHaveBeenCalledWith({
      concept: 'open',
      message: 'Opened Office 04',
      onUndo: undo,
    });
  });

  it('reports refused and thrown openTarget results without rejecting', async () => {
    const closedTarget: StoreHereTarget = {
      ...target,
      id: 'closed-box',
      name: 'Office 04',
      state: 'closed',
    };
    const setAccess = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'refused',
        refusal: {
          kind: 'outcome',
          outcome: { status: 'rejected', message: 'The box is locked.' },
        },
      })
      .mockRejectedValueOnce(new Error('item closed-box is not loaded'));
    mocks.useItemVerbs.mockReturnValue({ setAccess });
    const { result } = renderStore(closedTarget);

    await act(async () => {
      await expect(result.current.openTarget()).resolves.toBeUndefined();
      await expect(result.current.openTarget()).resolves.toBeUndefined();
    });

    expect(mocks.toastError).toHaveBeenNthCalledWith(1, 'The box is locked.');
    expect(mocks.toastError).toHaveBeenNthCalledWith(2, 'item closed-box is not loaded');
  });

  it('retries only active failed placement source queries', () => {
    const queryClient = createTestQueryClient();
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue();
    mocks.usePlacementSources.mockReturnValue({
      world: placementWorld(),
      isError: true,
      isLoading: false,
    });
    const { result } = renderStore(target, queryClient);

    act(() => result.current.retry());

    expect(refetchQueries).toHaveBeenCalledTimes(2);
    expect(refetchQueries).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'active', predicate: expect.any(Function) })
    );
    expect(refetchQueries).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'active', predicate: expect.any(Function) })
    );
  });

  it('stays quiet while offline', async () => {
    mocks.useOnline.mockReturnValue(false);
    const store = vi.fn();
    const setAccess = vi.fn();
    const commit = vi.fn();
    mocks.useBulkItemVerbs.mockReturnValue({ store });
    mocks.useItemVerbs.mockReturnValue({ setAccess });
    mocks.useBatchCreate.mockReturnValue({ commit, isRunning: false });
    const { result } = renderStore();

    await act(async () => {
      await result.current.create('Offline item');
      await result.current.store([row('item', 'Item')]);
      await result.current.openTarget();
    });

    expect(commit).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    expect(setAccess).not.toHaveBeenCalled();
  });

  it('reports pending and failed reads, retrying only failed item reads', () => {
    const hand = itemRows([], 'error');
    const all = itemRows([], 'success');
    mocks.useItemRows.mockImplementation(({ placementKind }: { placementKind?: string }) =>
      placementKind === 'hand' ? hand : all
    );
    const { result } = renderStore();

    expect(result.current.status).toBe('error');
    act(() => result.current.retry());
    expect(hand.refetch).toHaveBeenCalledOnce();
    expect(all.refetch).not.toHaveBeenCalled();
  });
});
