import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useBulkItemVerbs } from './item-verbs-bulk.js';
import { createPlaceActions } from './usePlaceMutationActions.js';

import type { PlaceRemoval, PlaceUndo } from './place-mutation-types.js';

export type { PlaceRemoval, PlaceUndo } from './place-mutation-types.js';

/** Place edits and deletion operations backed by the inventory REST API. */
export interface PlaceMutations {
  create: (name: string, parentId: string | null) => Promise<{ id: string } & PlaceUndo>;
  rename: (id: string, name: string) => Promise<PlaceUndo>;
  move: (id: string, parentId: string | null) => Promise<PlaceUndo>;
  arrange: (id: string, parentId: string | null, order: readonly string[]) => Promise<PlaceUndo>;
  remove: (removal: PlaceRemoval) => Promise<void>;
}

/** Provides optimistic place edits with compensating operations and rollback. */
export function usePlaceMutations(): PlaceMutations {
  const queryClient = useQueryClient();
  const bulkItemVerbs = useBulkItemVerbs();
  return useMemo(
    () => createPlaceActions(queryClient, bulkItemVerbs),
    [bulkItemVerbs, queryClient]
  );
}
