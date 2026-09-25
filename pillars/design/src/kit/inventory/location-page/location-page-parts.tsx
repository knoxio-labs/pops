/**
 * The location page's header pieces: the breadcrumb up through its
 * parents, the place's own verbs (Store here last and primary), and the
 * tab row with the in-place search.
 */
import { FolderPlus, PackagePlus, Search } from 'lucide-react';

import { Button, Input } from '@pops/ui';

import { Segmented, locationPath } from '../foundation';
import { MovePlaceButton } from '../locations-tree/move-controls';
import { PlaceMenu } from '../locations-tree/place-menu';
import { tallyPlace } from '../locations-tree/tree-model';

import type { LocationModel, PlacementWorld } from '../foundation';
import type { LocationsApi } from '../locations-tree/use-locations';
import type { PlaceTab } from './location-tab-body';

/** Locations, then each parent, then the place. */
export function placeCrumbs(world: PlacementWorld, place: LocationModel) {
  const parents = locationPath(world, place.id).slice(0, -1);
  return [
    { label: 'Locations', href: '#locations' },
    ...parents.map((node) => ({ label: node.name, href: `#${node.id}` })),
    { label: place.name },
  ];
}

/** The tab a place opens on: things here if any, else its places. */
export function defaultTab(world: PlacementWorld, id: string): PlaceTab {
  const tally = tallyPlace(world, id);
  if (tally.itemsHere + tally.boxesHere > 0) return 'items';
  return tally.places > 0 ? 'places' : 'items';
}

/** Props for {@link PlaceActions}. */
export interface PlaceActionsProps {
  api: LocationsApi;
  place: LocationModel;
  movingPlace: boolean;
  setMovingPlace: (open: boolean) => void;
  /** Switches to the Places tab, where the new place is typed. */
  showPlaces: () => void;
  onStoreHere: () => void;
}

/** The place's verbs, for the page header. */
export function PlaceActions({ api, place, ...props }: PlaceActionsProps) {
  const ghost = (label: string, Icon: typeof FolderPlus, onClick: () => void) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      prefix={<Icon className="size-4" aria-hidden />}
    >
      {label}
    </Button>
  );
  return (
    <>
      {ghost('New place inside', FolderPlus, () => {
        props.showPlaces();
        api.edits.startCreate(place.id);
      })}
      <MovePlaceButton
        world={api.world}
        place={place}
        open={props.movingPlace}
        onOpenChange={props.setMovingPlace}
        onPick={(parentId) => api.edits.moveTo(place.id, parentId)}
      />
      <Button onClick={props.onStoreHere} prefix={<PackagePlus className="size-4" aria-hidden />}>
        Store here
      </Button>
      <PlaceMenu
        name={place.name}
        handlers={{
          onRename: () => api.edits.startRename(place.id),
          onDelete: () => api.edits.requestDelete(place.id),
        }}
      />
    </>
  );
}

/** The tab row with counts, and the search over this place. */
export function PlaceToolbar({
  world,
  place,
  tab,
  onTab,
  query,
  onQuery,
}: {
  world: PlacementWorld;
  place: LocationModel;
  tab: PlaceTab;
  onTab: (tab: PlaceTab) => void;
  query: string;
  onQuery: (query: string) => void;
}) {
  const tally = tallyPlace(world, place.id);
  return (
    <div className="flex items-center gap-3 pb-3">
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
      <div className="relative ml-auto w-72">
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
