import { coreWorld } from '@/fixtures/inventory/core';
import {
  GARAGE,
  GRABBED_FROM_GARAGE,
  OPEN_TO_GARAGE,
  OVER_SHELVING,
  SHELVING,
  selected,
} from '@/fixtures/inventory/location-contents';
import { recentPlacements } from '@/fixtures/inventory/recents';
import { OFFLINE_TITLE, planMove } from '@/kit/inventory/foundation';
import { applyMove } from '@/kit/inventory/locations-tree/apply-move';
import { LocationsPage } from '@/kit/inventory/locations-tree/locations-page';
import {
  LocationsEmpty,
  LocationsError,
  LocationsLoading,
} from '@/kit/inventory/locations-tree/locations-states';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { LocationsPageProps } from '@/kit/inventory/locations-tree/locations-page';
import type { LocationsSeed } from '@/kit/inventory/locations-tree/use-locations';

export const meta: ScreenMeta = { title: 'Locations', order: 30, frame: 'web' };

const base: LocationsSeed = { world: coreWorld, selectedId: GARAGE, expanded: OPEN_TO_GARAGE };

function page(seed: Partial<LocationsSeed>, extra: Partial<LocationsPageProps> = {}) {
  return function LocationsState() {
    return <LocationsPage seed={{ ...base, ...seed }} recents={recentPlacements} {...extra} />;
  };
}

/**
 * `/inventory/locations`: the fixed tree of places beside the selected
 * place's contents. Places are renamed, added, moved and deleted from the
 * tree; things are dragged from the panel onto a place.
 */
export const states: ScreenStates = {
  selected: page(
    { selectedId: SHELVING },
    { initialSelection: selected(['box-cables', 'itm-pots'], 'itm-pots') }
  ),
  renaming: page({ renamingId: 'loc-workbench' }),
  'creating-inline': page({ creatingUnder: GARAGE }),
  'move-place': page({ selectedId: 'loc-workbench' }, { movingPlace: true }),
  'dragging-node': page({
    expanded: [...OPEN_TO_GARAGE, 'loc-study'],
    placeDrag: { placeId: 'loc-workbench', targetId: 'loc-study', position: 'inside' },
  }),
  'dragging-node-refused': page({
    placeDrag: { placeId: GARAGE, targetId: 'loc-toolbox', position: 'inside' },
  }),
  'dragging-node-reorder': page({
    placeDrag: { placeId: SHELVING, targetId: 'loc-workbench', position: 'before' },
  }),
  'dragging-items-onto-node': page(
    {
      expanded: ['loc-house', GARAGE],
      itemDrag: { ids: GRABBED_FROM_GARAGE, over: OVER_SHELVING },
    },
    { initialSelection: selected(GRABBED_FROM_GARAGE) }
  ),
  'delete-reparent': page({ deleting: { placeId: GARAGE, mode: 'reparent' } }),
  'delete-with-contents': page({ deleting: { placeId: GARAGE, mode: 'to-hand' } }),
  'delete-top-level': page({
    selectedId: 'loc-storage',
    expanded: ['loc-storage'],
    deleting: { placeId: 'loc-storage', mode: 'to-hand' },
  }),
  moved: page(
    {
      world: applyMove(
        coreWorld,
        planMove({ world: coreWorld, selectedIds: GRABBED_FROM_GARAGE, target: OVER_SHELVING })
      ),
    },
    { toast: { concept: 'move', message: 'Moved 4 things to Shelving' } }
  ),
  'empty-filtered': page({ selectedId: null, filter: 'attic' }),
  empty: () => <LocationsEmpty />,
  loading: () => <LocationsLoading />,
  error: () => <LocationsError />,
  offline: page(
    {},
    {
      banner: {
        kind: 'offline',
        title: OFFLINE_TITLE,
        detail: 'Renaming, moving and deleting come back when the connection does.',
      },
    }
  ),
  stale: page(
    {},
    {
      banner: {
        kind: 'stale',
        title: 'Places changed on iPhone 1 minute ago.',
        detail: 'What you see is from before that change.',
        actionLabel: 'Reload',
      },
    }
  ),
  tablet: page({ selectedId: GARAGE }, { single: true }),
};

export default function LocationsScreen() {
  return <LocationsPage seed={base} recents={recentPlacements} />;
}
