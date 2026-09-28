import { useEffect, useMemo } from 'react';

import { buildWorld } from '../../../foundation/model/placement-model.js';
import { useItemRows } from '../../../inventory-web/useWebItems.js';

import type { ItemRowModel } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';

const CONTENT_LIMIT = 200;

/** The direct-content read used by the container workspace. */
export interface ContainerContentsData {
  rows: ItemRowModel[];
  world: PlacementWorld;
  contentCounts: Readonly<Record<string, { readonly direct: number; readonly deep: number }>>;
  status: 'pending' | 'error' | 'success';
  error: unknown | null;
  refetch: () => void;
}

/** Loads all active direct contents and merges them into the detail placement world. */
export function useContainerContents(
  containerId: string,
  baseWorld: PlacementWorld
): ContainerContentsData {
  const query = useItemRows({ containingItemId: containerId }, CONTENT_LIMIT);

  useEffect(() => {
    if (query.status === 'success' && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  const world = useMemo(
    () =>
      buildWorld([...baseWorld.items.values(), ...query.rows], [...baseWorld.locations.values()]),
    [baseWorld, query.rows]
  );

  return {
    rows: query.rows,
    world,
    contentCounts: query.contentCounts,
    status: query.status,
    error: query.error,
    refetch: query.refetch,
  };
}
