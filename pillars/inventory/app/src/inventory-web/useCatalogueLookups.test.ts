import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { TypesReadCatalogueResponses } from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  typesReadCatalogue: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
}));

import { useCatalogueLookups, useTypeLookup } from './useCatalogueLookups';

type Catalogue = TypesReadCatalogueResponses[200];

const catalogue: Catalogue = {
  revision: {
    abandoned: null,
    baseRevision: null,
    created: {
      actor: { id: 'migration', kind: 'migration', label: 'Migration' },
      at: '2026-09-01T00:00:00.000Z',
    },
    draftVersion: 1,
    minimumProtocol: 1,
    published: {
      actor: { id: 'migration', kind: 'migration', label: 'Migration' },
      at: '2026-09-01T00:00:00.000Z',
      note: null,
    },
    revision: 3,
    status: 'published',
  },
  types: [
    {
      archivedAt: null,
      capabilities: ['containment'],
      description: 'Cable type',
      fields: [],
      id: 'type-cable',
      key: 'cable',
      label: 'Cables',
      legacyLabels: [],
      presentation: {},
      replacedBy: null,
      revision: 3,
      sortOrder: 0,
    },
  ],
};

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCatalogueLookups', () => {
  it('shares one published catalogue request across catalogue and type hooks', async () => {
    mocks.typesReadCatalogue.mockResolvedValue(ok(catalogue));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => ({
        lookups: useCatalogueLookups(),
        selected: useTypeLookup('type-cable'),
      }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.lookups.catalogue).toEqual(catalogue));

    expect(mocks.typesReadCatalogue).toHaveBeenCalledTimes(1);
    expect(result.current.lookups.typeNameById.get('type-cable')).toBe('Cables');
    expect(result.current.selected.type?.label).toBe('Cables');
    expect(result.current.selected.typeName).toBe('Cables');
  });

  it('reports the previous revision and keeps the first revision at null', async () => {
    const withBase: Catalogue = {
      ...catalogue,
      revision: { ...catalogue.revision, baseRevision: 2 },
    };
    mocks.typesReadCatalogue.mockResolvedValue(ok(withBase));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCatalogueLookups(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.catalogue).toEqual(withBase));
    expect(result.current.baseRevision).toBe(2);

    mocks.typesReadCatalogue.mockResolvedValue(ok(catalogue));
    const firstRevisionClient = createTestQueryClient();
    const firstRevision = renderHook(() => useCatalogueLookups(), {
      wrapper: withQueryClient(firstRevisionClient),
    });
    await waitFor(() => expect(firstRevision.result.current.catalogue).toEqual(catalogue));
    expect(firstRevision.result.current.baseRevision).toBeNull();
  });

  it('reports no previous revision while the published read is pending or failed', async () => {
    mocks.typesReadCatalogue.mockImplementation(() => new Promise(() => undefined));
    const pendingClient = createTestQueryClient();
    const pending = renderHook(() => useCatalogueLookups(), {
      wrapper: withQueryClient(pendingClient),
    });
    expect(pending.result.current.baseRevision).toBeNull();

    mocks.typesReadCatalogue.mockRejectedValue(new Error('unavailable'));
    const failedClient = createTestQueryClient();
    const failed = renderHook(() => useCatalogueLookups(), {
      wrapper: withQueryClient(failedClient),
    });
    await waitFor(() => expect(failed.result.current.error).toBeInstanceOf(Error));
    expect(failed.result.current.baseRevision).toBeNull();
  });
});
