import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { LOCATIONS_TREE_QUERY_KEY, WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import {
  LOCATION_TALLIES_QUERY_KEY,
  useLocationTallies,
} from '../../inventory-web/useLocationTallies.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useLocationModels } from '../location-page/location-page-model.js';
import { useLocationsEdits } from './locations-page-edits.js';
import { useTreeView } from './use-tree-view.js';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import type { LocationTallies } from '../../inventory-web/useLocationTallies.js';
import type { LocationModels } from '../location-page/location-page-model.js';
import type { LocationEdits } from './location-tree.js';
import type { TreeViewApi } from './use-tree-view.js';

/** State and commands consumed by the Locations page shell. */
export interface LocationsPageModel {
  readonly online: boolean;
  readonly locations: LocationModels;
  readonly tallies: LocationTallies;
  readonly world: PlacementWorld;
  readonly tree: TreeViewApi;
  readonly edits: LocationEdits;
  readonly changed: ChangedElsewhere;
  readonly selectedPlace: LocationModel | null;
  readonly movingPlace: boolean;
  readonly setMovingPlace: (open: boolean) => void;
  readonly retry: () => void;
  readonly openPlace: (id: string) => void;
  readonly startCreate: () => void;
  readonly onMove: (id: string) => void;
}

function useLocationsPageCommands({
  queryClient,
  locations,
  tallies,
  navigate,
  tree,
  edits,
  setMovingPlace,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  locations: LocationModels;
  tallies: LocationTallies;
  navigate: ReturnType<typeof useNavigate>;
  tree: TreeViewApi;
  edits: LocationEdits;
  setMovingPlace: (open: boolean) => void;
}): Pick<LocationsPageModel, 'retry' | 'openPlace' | 'startCreate' | 'onMove'> {
  const retry = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: LOCATIONS_TREE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: LOCATION_TALLIES_QUERY_KEY });
    locations.refetch();
    tallies.refetch();
  }, [locations, queryClient, tallies]);
  const openPlace = useCallback(
    (id: string): void => {
      void navigate(`/inventory/locations/${id}`);
    },
    [navigate]
  );
  const startCreate = useCallback((): void => {
    edits.startCreate(tree.selectedId);
  }, [edits, tree.selectedId]);
  const onMove = useCallback(
    (id: string): void => {
      tree.reveal(id);
      setMovingPlace(true);
    },
    [setMovingPlace, tree]
  );
  return { retry, openPlace, startCreate, onMove };
}

/** Loads and composes the query, tree, edit, and navigation state for Locations. */
export function useLocationsPageModel(): LocationsPageModel {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const online = useOnline();
  const locations = useLocationModels();
  const tallies = useLocationTallies();
  const world = useMemo(() => buildWorld([], locations.locations), [locations.locations]);
  const tree = useTreeView(world);
  const [movingPlace, setMovingPlace] = useState(false);
  const loaded = locations.status === 'success' && tallies.status === 'success';
  const changed = useChangedElsewhere({
    queryKeys: [
      LOCATIONS_TREE_QUERY_KEY,
      LOCATION_TALLIES_QUERY_KEY,
      [...WEB_ITEMS_QUERY_KEY, 'list'],
    ],
    enabled: loaded,
  });
  const onDeleted = useCallback(
    (parentId: string | null): void => {
      if (parentId === null) tree.select(null);
      else tree.reveal(parentId);
    },
    [tree]
  );
  const edits = useLocationsEdits({ online, world, tallyOf: tallies.tallyOf, onDeleted });
  const selectedPlace =
    tree.selectedId === null ? null : (world.locations.get(tree.selectedId) ?? null);
  const commands = useLocationsPageCommands({
    queryClient,
    locations,
    tallies,
    navigate,
    tree,
    edits,
    setMovingPlace,
  });
  return {
    online,
    locations,
    tallies,
    world,
    tree,
    edits,
    changed,
    selectedPlace,
    movingPlace,
    setMovingPlace,
    ...commands,
  };
}
