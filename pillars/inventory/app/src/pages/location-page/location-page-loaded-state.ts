import { useState } from 'react';
import { useLocation } from 'react-router';

import { LOCATIONS_TREE_QUERY_KEY, WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import {
  useChangedElsewhere,
  type ChangedElsewhere,
} from '../../inventory-web/useChangedElsewhere.js';
import { LOCATION_TALLIES_QUERY_KEY } from '../../inventory-web/useLocationTallies.js';
import { useContentsVerbs, type ContentsVerbState } from './location-page-content-verbs.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Mutable page-local controls and remote-change state for a loaded location. */
export interface LoadedLocationState {
  readonly route: ReturnType<typeof useLocation>;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly movingPlace: boolean;
  readonly setMovingPlace: (open: boolean) => void;
  readonly storeHereOpen: boolean;
  readonly setStoreHereOpen: (open: boolean) => void;
  readonly contentVerbs: ContentsVerbState;
  readonly changed: ChangedElsewhere;
}

/** Owns location-page search, overlays, item verbs, and changed-elsewhere polling. */
export function useLoadedLocationState(
  place: LocationModel,
  world: PlacementWorld,
  online: boolean,
  ready: boolean
): LoadedLocationState {
  const route = useLocation();
  const [query, setQuery] = useState('');
  const [movingPlace, setMovingPlace] = useState(false);
  const [storeHereOpen, setStoreHereOpen] = useState(false);
  const [movingItemIds, setMovingItemIds] = useState<readonly string[]>([]);
  const contentVerbs = useContentsVerbs(world, online, movingItemIds, setMovingItemIds);
  const changed = useChangedElsewhere({
    queryKeys: [
      LOCATIONS_TREE_QUERY_KEY,
      LOCATION_TALLIES_QUERY_KEY,
      [...WEB_ITEMS_QUERY_KEY, 'list'],
    ],
    entityId: place.id,
    enabled: ready,
  });
  return {
    route,
    query,
    setQuery,
    movingPlace,
    setMovingPlace,
    storeHereOpen,
    setStoreHereOpen,
    contentVerbs,
    changed,
  };
}
