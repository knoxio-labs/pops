import { locationTreeEmpty, locationTreeSingleRoot } from '@/fixtures/inventory-locations';
import {
  DEFAULT_LOCATIONS_CALLBACKS,
  DEFAULT_LOCATIONS_DATA,
  DEFAULT_LOCATIONS_PENDING,
  DEFAULT_LOCATIONS_SEED,
} from '@/kit/inventory/locations-tree/locations-page-types';
import {
  LocationsPageBody,
  LocationsPageDialogs,
} from '@/kit/inventory/locations-tree/locations-page-view';
import { PageHeaderActions } from '@/kit/inventory/locations-tree/page-header-actions';
import { useLocationsPageState } from '@/kit/inventory/locations-tree/use-locations-page-state';
import { MapPin } from 'lucide-react';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type {
  LocationsPageCallbacks,
  LocationsPageData,
  LocationsPagePending,
  LocationsPageSeed,
} from '@/kit/inventory/locations-tree/locations-page-types';

export const meta: ScreenMeta = { title: 'Locations', order: 5, frame: 'web' };

function EmptyState() {
  return (
    <div className="text-center py-16">
      <MapPin className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground">
        No locations yet. Add your first location to start organising.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="space-y-6">
      <PageHeader title="Locations" icon={<MapPin className="h-6 w-6 text-muted-foreground" />} />
      <p className="text-destructive">Failed to load locations.</p>
    </div>
  );
}

export interface LocationsPageProps {
  data?: LocationsPageData;
  hasError?: boolean;
  seed?: LocationsPageSeed;
  pending?: LocationsPagePending;
  callbacks?: LocationsPageCallbacks;
}

/**
 * `/inventory/locations`: the location tree, its drag-and-drop reorder, and
 * the contents panel for whichever location is selected.
 *
 * The app drives this from `useLocationTreePageModel` over react-query
 * mutations that settle by invalidating and refetching the tree; there is no
 * server here, so `useLocationsPageState` holds the tree in local state and
 * applies the same patches a round trip would leave behind directly (see
 * `tree-mutations.ts`).
 */
export function LocationsPage({
  data = DEFAULT_LOCATIONS_DATA,
  hasError = false,
  seed = DEFAULT_LOCATIONS_SEED,
  pending = DEFAULT_LOCATIONS_PENDING,
  callbacks = DEFAULT_LOCATIONS_CALLBACKS,
}: LocationsPageProps) {
  const state = useLocationsPageState({ data, seed });

  if (hasError) return <ErrorState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        icon={<MapPin className="h-6 w-6 text-muted-foreground" />}
        actions={
          <PageHeaderActions
            onAddRoot={state.handlers.onAddRootClick}
            onInsuranceReport={() => callbacks.onInsuranceReport()}
          />
        }
      />
      {state.showEmpty ? (
        <EmptyState />
      ) : (
        <LocationsPageBody state={state} data={data} seed={seed} callbacks={callbacks} />
      )}
      <LocationsPageDialogs state={state} pending={pending} />
    </div>
  );
}

export const states: ScreenStates = {
  loading: () => <LocationsPage data={{ ...DEFAULT_LOCATIONS_DATA, isLoading: true }} />,
  error: () => <LocationsPage hasError />,
  empty: () => <LocationsPage data={{ ...DEFAULT_LOCATIONS_DATA, tree: locationTreeEmpty }} />,
  'single-root': () => (
    <LocationsPage data={{ ...DEFAULT_LOCATIONS_DATA, tree: locationTreeSingleRoot }} />
  ),
  'selected-populated': () => (
    <LocationsPage seed={{ ...DEFAULT_LOCATIONS_SEED, selectedId: 'loc-kitchen' }} />
  ),
  'selected-empty': () => (
    <LocationsPage seed={{ ...DEFAULT_LOCATIONS_SEED, selectedId: 'loc-storage' }} />
  ),
  renaming: () => <LocationsPage seed={{ ...DEFAULT_LOCATIONS_SEED, renamingId: 'loc-bedroom' }} />,
  'add-root-open': () => <LocationsPage seed={{ ...DEFAULT_LOCATIONS_SEED, addingRoot: true }} />,
  'move-open': () => (
    <LocationsPage seed={{ ...DEFAULT_LOCATIONS_SEED, movingId: 'loc-tv-unit' }} />
  ),
  'delete-blocked': () => (
    <LocationsPage seed={{ ...DEFAULT_LOCATIONS_SEED, deleteConfirmId: 'loc-house' }} />
  ),
  dragging: () => (
    <LocationsPage
      seed={{
        ...DEFAULT_LOCATIONS_SEED,
        dragState: { activeId: 'loc-living', overId: 'loc-kitchen' },
      }}
    />
  ),
  'deeply-nested': () => (
    <LocationsPage
      seed={{
        ...DEFAULT_LOCATIONS_SEED,
        selectedId: 'loc-tv-drawer',
        expandedIds: new Set(['loc-living', 'loc-tv-unit']),
      }}
    />
  ),
};

export default function LocationsScreen() {
  return <LocationsPage />;
}
