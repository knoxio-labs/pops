import { coreWorld } from '@/fixtures/inventory/core';
import { GARAGE, HALL_CUPBOARD, selected } from '@/fixtures/inventory/location-contents';
import { recentPlacements } from '@/fixtures/inventory/recents';
import { buildWorld } from '@/kit/inventory/foundation';
import { LocationPage } from '@/kit/inventory/location-page/location-page';
import { PlaceGone } from '@/kit/inventory/location-page/place-gone';
import { movePlace } from '@/kit/inventory/locations-tree/tree-model';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { LocationPageProps } from '@/kit/inventory/location-page/location-page';

export const meta: ScreenMeta = { title: 'Location page', order: 6, frame: 'web' };

const emptyCupboard = buildWorld(
  [...coreWorld.items.values()].filter(
    (entry) =>
      !(entry.placement.kind === 'location' && entry.placement.locationId === HALL_CUPBOARD)
  ),
  [...coreWorld.locations.values()]
);

function page(props: Partial<LocationPageProps> = {}) {
  return function LocationPageState() {
    return (
      <LocationPage
        seed={{ world: coreWorld, selectedId: GARAGE }}
        recents={recentPlacements}
        {...props}
      />
    );
  };
}

/**
 * `/inventory/locations/:id`: one place, what sits directly in it, what is
 * in the boxes in it, and the places inside it. Store here, New place
 * inside, Move, Rename and Delete act on the place itself.
 */
export const states: ScreenStates = {
  places: page({ tab: 'places' }),
  items: page({ tab: 'items' }),
  'in-containers': page({ tab: 'in-boxes' }),
  selected: page({
    tab: 'in-boxes',
    initialSelection: selected(['itm-plates', 'itm-mugs'], 'itm-mugs'),
  }),
  searching: page({ tab: 'in-boxes', query: 'mon' }),
  'no-match': page({ tab: 'items', query: 'kettle' }),
  'new-place-inside': page({
    tab: 'places',
    seed: { world: coreWorld, selectedId: GARAGE, creatingUnder: GARAGE },
  }),
  renaming: page({ seed: { world: coreWorld, selectedId: GARAGE, renamingId: GARAGE } }),
  'store-here-entry': page({ storeHereOpen: true }),
  'move-place': page({
    seed: { world: coreWorld, selectedId: 'loc-workbench' },
    movingPlace: true,
  }),
  moved: page({
    seed: {
      world: movePlace(coreWorld, 'loc-workbench', 'loc-study'),
      selectedId: 'loc-workbench',
    },
    toast: { concept: 'move', message: 'Moved Workbench to Study' },
  }),
  'delete-with-contents': page({
    seed: { world: coreWorld, selectedId: GARAGE, deleting: { placeId: GARAGE, mode: 'to-hand' } },
  }),
  'deleted-previous-place': () => <PlaceGone name="Garage" inHand={7} deletedBy="iPhone" />,
  empty: page({ seed: { world: emptyCupboard, selectedId: HALL_CUPBOARD } }),
  offline: page({
    banner: {
      kind: 'offline',
      title: 'No connection. Showing what loaded.',
      detail: 'Storing, moving and deleting come back when the connection does.',
    },
  }),
  stale: page({
    banner: {
      kind: 'stale',
      title: 'Garage changed on iPhone 2 minutes ago.',
      detail: 'Your selection stays until you reload.',
      actionLabel: 'Reload',
    },
  }),
};

export default function LocationPageScreen() {
  return (
    <LocationPage seed={{ world: coreWorld, selectedId: GARAGE }} recents={recentPlacements} />
  );
}
