import { QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LOCATION_TREE_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { withQueryClient } from '../../inventory-web/test-utils.js';

import type { LocationsTreeResponse } from '../../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({ locationsTree: vi.fn() }));

vi.mock('../../inventory-api/index.js', () => ({
  locationsTree: (...args: unknown[]) => mocks.locationsTree(...args),
}));

import { useLocationModels } from './location-page-model.js';

const locations: LocationsTreeResponse = {
  data: [
    {
      children: [],
      id: 'home',
      name: 'Home',
      parentId: null,
      sortOrder: 0,
    },
  ],
};

describe('useLocationModels', () => {
  it('reads the location tree from the shared response-envelope cache', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(LOCATION_TREE_QUERY_KEY, locations);

    const { result } = renderHook(() => useLocationModels(), {
      wrapper: withQueryClient(queryClient),
    });

    expect(result.current.locations).toEqual([
      { id: 'home', name: 'Home', parentId: null, kind: 'property' },
    ]);
  });
});
