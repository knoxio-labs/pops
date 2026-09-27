import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  LOCATIONS_TREE_QUERY_KEY,
  PLACEMENT_SOURCES_QUERY_KEY,
  WEB_ITEMS_QUERY_KEY,
} from '../../inventory-web/queryKeys.js';
import { useConnectionsChanged } from '../../inventory-web/useConnectionsChanged.js';
import { useConnectionMutations } from '../../inventory-web/useConnectionsRegistry.js';
import { fixtureItemsQueryKey, useFixtureItems } from '../../inventory-web/useFixtures.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useFixture } from './fixture-detail-parts.js';
import { useFixtureMutations } from './fixture-mutations.js';
import { fixtureQueryKey } from './fixture-query-keys.js';

const FIXTURES_QUERY_PREFIX = ['inventory', 'fixtures'] as const;

/** Reads one fixture, its wired items, placement world, and page-level write state. */
export function useFixtureDetailPageModel(id: string) {
  const fixtureQuery = useFixture(id);
  const items = useFixtureItems(id);
  const placementSubject = useMemo(
    () => ({ kind: 'items' as const, ids: items.items.map((item) => item.id) }),
    [items.items]
  );
  const placement = usePlacementSources(placementSubject);
  const online = useOnline();
  const changed = useConnectionsChanged({
    queryKeys: [FIXTURES_QUERY_PREFIX],
    enabled: fixtureQuery.status === 'success',
  });
  const mutations = useFixtureMutations();
  const connectionMutations = useConnectionMutations();
  const queryClient = useQueryClient();
  const retryFixture = useCallback((): void => {
    void queryClient.refetchQueries({ queryKey: fixtureQueryKey(id) });
  }, [id, queryClient]);
  const retryPlacement = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PLACEMENT_SOURCES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  }, [queryClient]);
  const retryLocations = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
  }, [queryClient]);
  const retryItems = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: fixtureItemsQueryKey(id) });
  }, [id, queryClient]);

  return {
    id,
    fixture: fixtureQuery.data,
    fixtureStatus: fixtureQuery.status,
    fixtureError: fixtureQuery.error,
    items,
    placement,
    online,
    changed,
    mutations,
    connectionMutations,
    retryFixture,
    retryLocations,
    retryPlacement,
    retryItems,
    refetch: retryFixture,
  };
}
