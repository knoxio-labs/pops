import { Search } from 'lucide-react';

import { Input } from '@pops/ui';

import { Segmented } from '../../foundation/frame/segmented.js';
import { placeSummary as formatPlaceSummary } from '../../foundation/places/place-summary.js';

import type { ReactElement } from 'react';

import type { BreadcrumbSegment } from '@pops/ui';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PendingDelete } from '../../foundation/places/delete-place-dialog.js';
import type { DeleteMode, DeletePlan } from '../../foundation/places/delete-plan.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';

/** The three tabs shown by a location page. */
export type PlaceTab = 'items' | 'in-boxes' | 'places';

/** The URL value of each location-page tab. */
export const TAB_PARAM: Readonly<Record<PlaceTab, string>> = {
  items: 'items',
  'in-boxes': 'in-containers',
  places: 'places',
};

/** The operations and state needed by a location page's place controls. */
export interface PlaceEditsApi {
  readonly creatingUnder: string | null;
  readonly renamingId: string | null;
  readonly deleting: DeletePlaceState | null;
  readonly pendingDelete?: PendingDelete | null;
  readonly lastMove: PlaceMoveNotice | null;
  readonly error: string | null;
  startCreate: (parentId?: string) => void;
  commitCreate: (name: string) => void;
  cancelCreate: () => void;
  startRename: (id: string | null) => void;
  commitRename: (name: string) => void;
  moveTo: (id: string, parentId: string | null) => void;
  readonly arrange?: (id: string, parentId: string | null, order: readonly string[]) => void;
  readonly setDeleteMode?: (mode: DeleteMode) => void;
  readonly confirmDeletePlan?: (plan: DeletePlan) => void;
  requestDelete: (id: string) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  clearMoveNotice: () => void;
  clearError: () => void;
}

/** The outcome summary displayed before a place deletion is sent. */
export interface DeletePlaceState {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly childCount: number;
  readonly descendantCount: number;
  readonly itemCount: number;
  readonly requiresForce: boolean;
}

/** The undoable notice shown after a place changes parent. */
export interface PlaceMoveNotice {
  readonly name: string;
  readonly parentName: string;
  readonly undo: () => void;
}

/** The tab for a URL value; null for an absent or unknown value. */
export function parsePlaceTab(value: string | null): PlaceTab | null {
  if (value === TAB_PARAM.items) return 'items';
  if (value === TAB_PARAM['in-boxes']) return 'in-boxes';
  if (value === TAB_PARAM.places) return 'places';
  return null;
}

/** Returns the first non-empty count-driven tab for a place. */
export function defaultTab(tally: PlaceTally): PlaceTab {
  if (tally.itemsHere + tally.boxesHere > 0) return 'items';
  if (tally.places > 0) return 'places';
  return 'items';
}

/** Returns Locations, each parent, and the current place as breadcrumb segments. */
export function placeCrumbs(world: PlacementWorld, place: LocationModel): BreadcrumbSegment[] {
  const path: LocationModel[] = [];
  const seen = new Set<string>();
  let current: LocationModel | undefined = place;
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : world.locations.get(current.parentId);
  }

  return [
    { label: 'Locations', href: '/inventory/locations' },
    ...path.slice(0, -1).map((node) => ({
      label: node.name,
      href: `/inventory/locations/${node.id}`,
    })),
    { label: place.name },
  ];
}

/** Formats the server tally as the single line under a place title. */
export const placeSummary = formatPlaceSummary;

/** Props for {@link PlaceToolbar}. */
export interface PlaceToolbarProps {
  place: LocationModel;
  tally: PlaceTally;
  tab: PlaceTab;
  onTab: (tab: PlaceTab) => void;
  query: string;
  onQuery: (query: string) => void;
}

/** Renders the location tabs and page-local search input. */
export function PlaceToolbar({
  place,
  tally,
  tab,
  onTab,
  query,
  onQuery,
}: PlaceToolbarProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3 pb-1">
      <Segmented
        label={`What is in ${place.name}`}
        value={tab}
        onChange={onTab}
        segments={[
          { id: 'items', label: 'Here', count: tally.itemsHere + tally.boxesHere },
          { id: 'in-boxes', label: 'In boxes here', count: tally.inBoxes },
          { id: 'places', label: 'Places inside', count: tally.places },
        ]}
      />
      <div className="relative ml-auto w-full max-w-72">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label={`Find in ${place.name}`}
          placeholder="Find by name or code"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          className="h-9 pl-8"
        />
      </div>
    </div>
  );
}
