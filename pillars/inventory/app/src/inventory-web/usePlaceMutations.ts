import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useBulkItemVerbs } from './item-verbs-bulk.js';
import { createPlaceActions } from './usePlaceMutationActions.js';

/** The compensating operation exposed by reversible place mutations. */
export interface PlaceUndo {
  undo: () => Promise<void>;
}

/** The server-side effects planned for deleting one place. */
export interface PlaceRemoval {
  placeId: string;
  mode: 'reparent' | 'to-hand';
  parentId: string | null;
  subtreeIds: readonly string[];
  thingIds: readonly string[];
}

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
