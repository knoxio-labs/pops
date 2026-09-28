import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils.js';
import {
  arrivalCandidates,
  dismissType,
  readDismissedTypes,
  useTypeArrival,
} from './type-arrivals.js';

import type { TypesReadCatalogueResponses, WebListResponses } from '../inventory-api/types.gen.js';
import type { CatalogueType } from './useCatalogueLookups.js';

const mocks = vi.hoisted(() => ({
  typesReadCatalogue: vi.fn(),
  webList: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

type Catalogue = TypesReadCatalogueResponses[200];
type WebPage = WebListResponses['200'];

function type(
  id: string,
  key: string,
  sortOrder: number,
  legacyLabels: string[],
  overrides: Partial<CatalogueType> = {}
): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [],
    id,
    key,
    label: key,
    legacyLabels,
    presentation: {},
    replacedBy: null,
    revision: 8,
    sortOrder,
    ...overrides,
  };
}

function catalogue(types: readonly CatalogueType[], baseRevision: number | null): Catalogue {
  return {
    revision: {
      abandoned: null,
      baseRevision,
      created: { actor: { id: 'test', kind: 'migration', label: 'Test' }, at: '2026-01-01' },
      draftVersion: 1,
      minimumProtocol: 1,
      published: {
        actor: { id: 'test', kind: 'migration', label: 'Test' },
        at: '2026-01-01',
        note: null,
      },
      revision: 8,
      status: 'published',
    },
    types: [...types],
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function page(total: number): WebPage {
  return {
    contentCounts: {},
    hiddenInactiveCount: 0,
    items: [],
    nextCursor: null,
    total,
    unfilteredTotal: total,
  };
}

function deferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('deferred promise was not initialized');
      resolvePromise(value);
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('arrivalCandidates', () => {
  it('treats a type absent from the base as new', () => {
    const current = type('lighting', 'lighting', 1, ['Lamp']);
    expect(arrivalCandidates([current], [], [])).toEqual([current]);
  });

  it('treats a gained legacy label as new and ignores case, spacing and removed labels', () => {
    const gained = type('garden', 'garden', 1, [' garden tools ', 'new label']);
    const removedOnly = type('old', 'old', 2, ['Garden']);

    expect(
      arrivalCandidates(
        [gained, removedOnly],
        [
          { id: 'garden', legacyLabels: ['GARDEN TOOLS', 'removed label'] },
          { id: 'old', legacyLabels: ['Garden', 'no longer used'] },
        ],
        []
      ).map(({ id }) => id)
    ).toEqual(['garden']);
  });

  it('skips a type unchanged since the base', () => {
    const unchanged = type('garden', 'garden', 1, ['Garden', 'Tools']);
    expect(
      arrivalCandidates([unchanged], [{ id: 'garden', legacyLabels: [' garden ', 'TOOLS'] }], [])
    ).toEqual([]);
  });

  it('does not treat an empty legacy label as a gained label', () => {
    const unchanged = type('garden', 'garden', 1, ['Garden', '   ']);
    expect(
      arrivalCandidates([unchanged], [{ id: 'garden', legacyLabels: ['garden'] }], [])
    ).toEqual([]);
  });

  it('treats every type as new when there is no base revision', () => {
    const current = [
      type('garden', 'garden', 1, ['Garden']),
      type('lighting', 'lighting', 2, ['']),
    ];
    expect(arrivalCandidates(current, null, [])).toEqual([current[0]]);
  });

  it('skips archived types, types without legacy labels and dismissed types', () => {
    const candidates = arrivalCandidates(
      [
        type('archived', 'archived', 1, ['Old'], { archivedAt: '2026-01-02' }),
        type('empty', 'empty', 2, ['   ']),
        type('dismissed', 'dismissed', 3, ['Old']),
        type('kept', 'kept', 4, ['Old']),
      ],
      null,
      ['dismissed']
    );

    expect(candidates.map(({ id }) => id)).toEqual(['kept']);
  });
});

describe('useTypeArrival', () => {
  it('reads the base revision once and picks the first new type with matches in sort order', async () => {
    const first = type('first', 'first', 0, ['First']);
    const second = type('second', 'second', 1, ['Second']);
    const current = catalogue([first, second], 7);
    const base = catalogue([type('first', 'first', 0, ['First'])], null);
    mocks.typesReadCatalogue.mockImplementation((options?: { query?: { revision?: number } }) =>
      options?.query?.revision === 7 ? Promise.resolve(ok(base)) : Promise.resolve(ok(current))
    );
    mocks.webList.mockImplementation(({ query }: { query: { legacyLabelOf?: string } }) =>
      Promise.resolve(ok(page(query.legacyLabelOf === 'first' ? 0 : 4)))
    );

    const client = createTestQueryClient();
    const { result } = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.arrival?.type.id).toBe('second'));
    expect(mocks.typesReadCatalogue).toHaveBeenCalledWith({ query: { revision: 7 } });
    expect(
      mocks.typesReadCatalogue.mock.calls.filter(([options]) => options?.query?.revision === 7)
    ).toHaveLength(1);
    expect(result.current.arrival?.matches).toBe(4);
  });

  it('sends no count for a type unchanged since the base revision', async () => {
    const unchanged = type('garden', 'garden', 0, ['Garden']);
    const current = catalogue([unchanged], 7);
    const base = catalogue([type('garden', 'garden', 0, [' garden '])], null);
    mocks.typesReadCatalogue.mockImplementation((options?: { query?: { revision?: number } }) =>
      options?.query?.revision === 7 ? Promise.resolve(ok(base)) : Promise.resolve(ok(current))
    );

    const client = createTestQueryClient();
    const { result } = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(client),
    });
    await waitFor(() => expect(result.current.arrival).toBeNull());
    expect(mocks.webList).not.toHaveBeenCalled();
  });

  it('sends no count while the base revision is pending or after it failed', async () => {
    const current = catalogue([type('garden', 'garden', 0, ['Garden'])], 7);
    const pendingBase = deferred<ReturnType<typeof ok<Catalogue>>>();
    mocks.typesReadCatalogue.mockImplementation((options?: { query?: { revision?: number } }) =>
      options?.query?.revision === 7 ? pendingBase.promise : Promise.resolve(ok(current))
    );
    const pendingClient = createTestQueryClient();
    const pending = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(pendingClient),
    });
    await waitFor(() =>
      expect(mocks.typesReadCatalogue).toHaveBeenCalledWith({ query: { revision: 7 } })
    );
    expect(mocks.webList).not.toHaveBeenCalled();
    expect(pending.result.current.arrival).toBeNull();

    mocks.typesReadCatalogue.mockImplementation((options?: { query?: { revision?: number } }) =>
      options?.query?.revision === 7
        ? Promise.reject(new Error('base unavailable'))
        : Promise.resolve(ok(current))
    );
    const failedClient = createTestQueryClient();
    const failed = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(failedClient),
    });
    await waitFor(() => expect(mocks.typesReadCatalogue).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(failed.result.current.arrival).toBeNull());
    expect(mocks.webList).not.toHaveBeenCalled();
  });

  it('fetches nothing while the published revision is null', async () => {
    mocks.typesReadCatalogue.mockImplementation(() => new Promise(() => undefined));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(client),
    });

    expect(result.current.arrival).toBeNull();
    await waitFor(() => expect(mocks.typesReadCatalogue).toHaveBeenCalledOnce());
    expect(mocks.webList).not.toHaveBeenCalled();
  });

  it('makes no base read for the first revision', async () => {
    const current = catalogue([type('garden', 'garden', 0, ['Garden'])], null);
    mocks.typesReadCatalogue.mockResolvedValue(ok(current));
    mocks.webList.mockResolvedValue(ok(page(0)));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(mocks.webList).toHaveBeenCalledOnce());
    expect(mocks.typesReadCatalogue).toHaveBeenCalledTimes(1);
    expect(result.current.arrival).toBeNull();
  });

  it('dismiss hides the type and stores its id', async () => {
    const current = catalogue([type('garden', 'garden', 0, ['Garden'])], null);
    mocks.typesReadCatalogue.mockResolvedValue(ok(current));
    mocks.webList.mockResolvedValue(ok(page(3)));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(client),
    });
    await waitFor(() => expect(result.current.arrival?.type.id).toBe('garden'));

    act(() => result.current.dismiss('garden'));
    await waitFor(() => expect(result.current.arrival).toBeNull());
    expect(readDismissedTypes()).toEqual(['garden']);
  });

  it('a throwing localStorage reads as nothing dismissed and still hides on dismiss', async () => {
    const current = catalogue([type('garden', 'garden', 0, ['Garden'])], null);
    mocks.typesReadCatalogue.mockResolvedValue(ok(current));
    mocks.webList.mockResolvedValue(ok(page(3)));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useTypeArrival(), {
      wrapper: withQueryClient(client),
    });
    await waitFor(() => expect(result.current.arrival?.type.id).toBe('garden'));

    act(() => result.current.dismiss('garden'));
    await waitFor(() => expect(result.current.arrival).toBeNull());
  });
});

describe('browser dismissal', () => {
  it('ignores malformed storage and records a type id once', () => {
    localStorage.setItem('pops.inventory.type-arrived.dismissed', '{bad');
    expect(readDismissedTypes()).toEqual([]);
    dismissType('type-a');
    dismissType('type-a');
    expect(readDismissedTypes()).toEqual(['type-a']);
  });
});
