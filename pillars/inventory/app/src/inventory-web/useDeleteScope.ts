import { useEffect, useMemo } from 'react';

import { buildWorld, type PlacementWorld } from '../foundation/model/placement-model.js';
import { useItemRows, type ItemRows } from './useWebItems.js';
import { useWebSearchLocations } from './useWebSearchLocations.js';

const DELETE_SCOPE_LIMIT = 200;

/** The complete placement world used while a place deletion is being decided. */
export interface DeleteScope {
  world: PlacementWorld;
  status: 'pending' | 'error' | 'success';
}

function scopeStatus(
  rows: ItemRows,
  locationsStatus: 'pending' | 'error' | 'success'
): DeleteScope['status'] {
  if (rows.status === 'error' || locationsStatus === 'error') return 'error';
  if (
    rows.status === 'pending' ||
    locationsStatus === 'pending' ||
    rows.hasNextPage ||
    rows.isFetchingNextPage
  ) {
    return 'pending';
  }
  return 'success';
}

/** Loads every active or inactive item within a place and builds its placement world. */
export function useDeleteScope(placeId: string): DeleteScope {
  const rows = useItemRows({ within: placeId, includeInactive: true }, DELETE_SCOPE_LIMIT);
  const locations = useWebSearchLocations();
  const { fetchNextPage, hasNextPage, isFetchingNextPage, rows: itemRows, status } = rows;

  useEffect(() => {
    if (status === 'success' && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, status]);

  const world = useMemo(
    () => buildWorld(itemRows, locations.locations),
    [itemRows, locations.locations]
  );

  return {
    world,
    status: scopeStatus(rows, locations.status),
  };
}
