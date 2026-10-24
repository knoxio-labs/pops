import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from '../../inventory-web/test-utils.js';

import type { WebListResponses } from '../../inventory-api/types.gen.js';

type WebItem = WebListResponses[200]['items'][number];

const mocks = vi.hoisted(() => ({
  webList: vi.fn(),
  catalogue: vi.fn(),
  treeFragility: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
  codesSuggest: vi.fn(),
}));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  usePublishedCatalogue: () => mocks.catalogue(),
}));

vi.mock('./label-fragility.js', () => ({
  treeFragility: (...args: unknown[]) => mocks.treeFragility(...args),
}));

import { useLabelSubjects } from './useLabelSubjects.js';

const base: WebItem = {
  access: null,
  catalogueRevision: 1,
  code: 'code',
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'base',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Base',
  note: null,
  photos: [],
  placement: { kind: 'hand' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const box = { ...base, id: 'box', isContainer: true, name: 'Box' };
const child = { ...base, id: 'child', name: 'Child' };
const deep = { ...base, id: 'deep', name: 'Deep', lifecycle: 'retired' as const };
const unrelated = { ...base, id: 'unrelated', name: 'Unrelated' };

function page(items: WebItem[], nextCursor: string | null = null) {
  return { data: { items, nextCursor }, error: undefined, response: { status: 200 } };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('not initialized');
  };
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalogue.mockReturnValue({ typeById: new Map(), isPending: false, error: null });
  mocks.treeFragility.mockImplementation((item: WebItem, descendants: readonly WebItem[]) => ({
    fragile: descendants.some((descendant) => descendant.id === 'deep'),
    recorded: false,
    fields: new Set<string>(),
    error: item.id === 'fault' ? new Error('fragility unavailable') : null,
  }));
});

describe('useLabelSubjects', () => {
  it('keeps loading until every descendant page is available, then aggregates only its tree', async () => {
    const lastPage = deferred<ReturnType<typeof page>>();
    mocks.webList.mockImplementation(
      ({ query }: { query: { ids?: string; within?: string; cursor?: string } }) => {
        if (query.ids) return Promise.resolve(page([box]));
        if (query.within && query.cursor) return lastPage.promise;
        if (query.within) return Promise.resolve(page([child], 'more'));
        return Promise.resolve(page([child]));
      }
    );
    const { result } = renderHook(() => useLabelSubjects(['box']), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() =>
      expect(mocks.webList).toHaveBeenCalledWith({
        query: { within: 'box', includeInactive: true, limit: 200, cursor: 'more' },
      })
    );
    expect(result.current.reads.descendants.get('box')?.pending).toBe(true);
    lastPage.resolve(page([deep]));

    await waitFor(() => expect(result.current.reads.descendants.get('box')?.pending).toBe(false));
    expect(result.current.fragility.get('box')?.fragile).toBe(true);
    expect(result.current.contents.get('box')?.map((item) => item.id)).toEqual(['child']);
    expect(mocks.treeFragility).toHaveBeenCalledWith(box, [child, deep], expect.any(Map));
    expect(mocks.webList).toHaveBeenCalledWith({
      query: { within: 'box', includeInactive: true, limit: 200 },
    });
  });
  it('does not load descendants for ordinary items or include unrelated items', async () => {
    mocks.webList.mockResolvedValue(page([child, unrelated]));
    const { result } = renderHook(() => useLabelSubjects(['child']), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.subjects.map((item) => item.id)).toEqual(['child']);
    expect(mocks.webList).toHaveBeenCalledTimes(1);
    expect(mocks.treeFragility).toHaveBeenCalledWith(child, [], expect.any(Map));
  });
  it('keeps descendant and catalogue failures separate from selected item failures', async () => {
    mocks.catalogue.mockReturnValue({
      typeById: new Map(),
      isPending: false,
      error: new Error('catalogue unavailable'),
    });
    mocks.webList.mockImplementation(({ query }: { query: { ids?: string; within?: string } }) => {
      if (query.ids) return Promise.resolve(page([box]));
      if (query.within) return Promise.reject(new Error('descendants unavailable'));
      return Promise.resolve(page([]));
    });
    const { result } = renderHook(() => useLabelSubjects(['box']), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() =>
      expect(result.current.reads.descendants.get('box')?.error?.message).toBe(
        'descendants unavailable'
      )
    );
    expect(result.current.error).toBeNull();
    expect(result.current.contentsLoading).toBe(false);
  });
  it('reports a fragility evaluation error for a selected item', async () => {
    mocks.webList.mockResolvedValue(page([{ ...child, id: 'fault' }]));
    const { result } = renderHook(() => useLabelSubjects(['fault']), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() =>
      expect(result.current.fragility.get('fault')?.error?.message).toBe('fragility unavailable')
    );
    expect(result.current.error).toBeNull();
  });

  it('waits for the catalogue and reports its failure independently', async () => {
    mocks.catalogue.mockReturnValue({ typeById: new Map(), isPending: true, error: null });
    mocks.webList.mockResolvedValue(page([child]));
    const { result, rerender } = renderHook(() => useLabelSubjects(['child']), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reads.catalogue.pending).toBe(true);
    mocks.catalogue.mockReturnValue({
      typeById: new Map(),
      isPending: false,
      error: new Error('catalogue unavailable'),
    });
    rerender();
    expect(result.current.contentsLoading).toBe(false);
    expect(result.current.reads.catalogue.error?.message).toBe('catalogue unavailable');
    expect(result.current.error).toBeNull();
  });

  it('does not expose the previous selection while its replacement is pending', async () => {
    const nextPage = deferred<ReturnType<typeof page>>();
    mocks.webList.mockImplementation(({ query }: { query: { ids?: string } }) =>
      query.ids === 'other' ? nextPage.promise : Promise.resolve(page([child]))
    );
    const { result, rerender } = renderHook(({ ids }) => useLabelSubjects(ids), {
      initialProps: { ids: ['child'] },
      wrapper: withQueryClient(createTestQueryClient()),
    });
    await waitFor(() => expect(result.current.subjects.map((item) => item.id)).toEqual(['child']));

    rerender({ ids: ['other'] });
    expect(result.current.contentsLoading).toBe(true);
    expect(result.current.subjects).toEqual([]);
    expect(result.current.fragility.size).toBe(0);
    nextPage.resolve(page([{ ...child, id: 'other' }]));
    await waitFor(() => expect(result.current.subjects.map((item) => item.id)).toEqual(['other']));
  });
});
