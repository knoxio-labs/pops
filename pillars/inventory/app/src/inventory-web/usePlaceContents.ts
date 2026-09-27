import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import { buildWorld, type PlacementWorld } from '../foundation/model/placement-model.js';
import { InventoryApiError } from '../inventory-api-helpers.js';
import { LOCATION_TREE_QUERY_KEY } from './queryKeys.js';
import { useItemRows, type ItemRows } from './useWebItems.js';
import { useWebSearchLocations } from './useWebSearchLocations.js';

import type { LocationModel } from '../foundation/model/model.js';

const PLACE_CONTENTS_LIMIT = 200;
const EMPTY_LOCATIONS: readonly LocationModel[] = [];

/** The fully loaded contents world for one place. */
export interface PlaceContentsData {
  world: PlacementWorld;
  status: 'pending' | 'error' | 'success';
  error: InventoryApiError | null;
  refetch: () => void;
}

function contentsStatus(
  direct: ItemRows,
  boxed: ItemRows,
  locationsStatus: 'pending' | 'error' | 'success'
): PlaceContentsData['status'] {
  if (direct.status === 'error' || boxed.status === 'error' || locationsStatus === 'error') {
    return 'error';
  }
  if (
    direct.status === 'pending' ||
    boxed.status === 'pending' ||
    locationsStatus === 'pending' ||
    direct.hasNextPage ||
    boxed.hasNextPage ||
    direct.isFetchingNextPage ||
    boxed.isFetchingNextPage
  ) {
    return 'pending';
  }
  return 'success';
}

function locationQueryError(
  queryClient: ReturnType<typeof useQueryClient>
): InventoryApiError | null {
  const error = queryClient.getQueryState(LOCATION_TREE_QUERY_KEY)?.error;
  return error instanceof InventoryApiError ? error : null;
}

/** Loads direct and boxed contents, completes both cursors, and builds one placement world. */
export function usePlaceContents(placeId: string): PlaceContentsData {
  const queryClient = useQueryClient();
  const direct = useItemRows(
    { placementKind: 'location', locationId: placeId },
    PLACE_CONTENTS_LIMIT
  );
  const boxed = useItemRows(
    { placementKind: 'container', effectiveLocationId: placeId },
    PLACE_CONTENTS_LIMIT
  );
  const locations = useWebSearchLocations();
  const {
    error: directError,
    fetchNextPage: fetchDirectNextPage,
    hasNextPage: directHasNextPage,
    isFetchingNextPage: isFetchingDirectNextPage,
    refetch: refetchDirect,
    rows: directRows,
    status: directStatus,
  } = direct;
  const {
    error: boxedError,
    fetchNextPage: fetchBoxedNextPage,
    hasNextPage: boxedHasNextPage,
    isFetchingNextPage: isFetchingBoxedNextPage,
    refetch: refetchBoxed,
    rows: boxedRows,
    status: boxedStatus,
  } = boxed;

  useEffect(() => {
    if (directStatus === 'success' && directHasNextPage && !isFetchingDirectNextPage) {
      fetchDirectNextPage();
    }
  }, [directHasNextPage, directStatus, fetchDirectNextPage, isFetchingDirectNextPage]);
  useEffect(() => {
    if (boxedStatus === 'success' && boxedHasNextPage && !isFetchingBoxedNextPage) {
      fetchBoxedNextPage();
    }
  }, [boxedHasNextPage, boxedStatus, fetchBoxedNextPage, isFetchingBoxedNextPage]);

  const world = useMemo(
    () =>
      buildWorld(
        [...directRows, ...boxedRows],
        locations.locations.length === 0 ? EMPTY_LOCATIONS : locations.locations
      ),
    [boxedRows, directRows, locations.locations]
  );
  const status = contentsStatus(direct, boxed, locations.status);
  const error = directError ?? boxedError ?? locationQueryError(queryClient);
  const refetch = useCallback(() => {
    refetchDirect();
    refetchBoxed();
  }, [refetchBoxed, refetchDirect]);

  return { world, status, error, refetch };
}
