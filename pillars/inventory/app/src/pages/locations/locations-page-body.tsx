import { useCallback, useState } from 'react';

import { PlacesDnd } from '../../foundation/places/places-dnd.js';
import { childPlaces } from '../../foundation/places/tree-model.js';
import { LocationTree, type LocationEdits } from './location-tree.js';
import { LocationsEmpty, LocationsError, LocationsLoading } from './locations-states.js';
import { PlacePreview } from './place-preview.js';
import { usePlaceDrag } from './use-place-drag.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { DropPosition } from '../../foundation/places/tree-model.js';
import type { LocationTallies } from '../../inventory-web/useLocationTallies.js';
import type { LocationModels } from '../location-page/location-page-model.js';
import type { TreeViewApi } from './use-tree-view.js';

/** Props for the loaded, loading, empty, and error bodies of Locations. */
export interface LocationsBodyProps {
  readonly locations: LocationModels;
  readonly tallies: LocationTallies;
  readonly world: PlacementWorld;
  readonly tree: TreeViewApi;
  readonly edits: LocationEdits;
  readonly online: boolean;
  readonly selectedPlace: LocationModel | null;
  readonly movingPlace: boolean;
  readonly onMovingPlaceChange: (open: boolean) => void;
  readonly onRetry: () => void;
  readonly onOpen: (id: string) => void;
  readonly onMove: (id: string) => void;
  readonly onNewPlace: () => void;
}

interface ItemDragState {
  placeId: string;
  drag: DragPlacementApi;
}

function placeDropOrder(
  world: PlacementWorld,
  placeId: string,
  targetId: string,
  position: DropPosition
): { parentId: string | null; order: string[] } | null {
  const target = world.locations.get(targetId);
  if (target === undefined) return null;
  const parentId = position === 'inside' ? target.id : target.parentId;
  const siblingIds = childPlaces(world, parentId)
    .map((place) => place.id)
    .filter((id) => id !== placeId);
  const targetIndex = siblingIds.indexOf(targetId);
  let insertion = siblingIds.length;
  if (position !== 'inside' && targetIndex >= 0) {
    insertion = position === 'before' ? targetIndex : targetIndex + 1;
  }
  siblingIds.splice(insertion, 0, placeId);
  return { parentId, order: siblingIds };
}

interface LoadedLocationsProps extends LocationsBodyProps {
  itemDrag?: DragPlacementApi;
  placeDrag: ReturnType<typeof usePlaceDrag>;
  onItemDragChange: (drag: DragPlacementApi | undefined) => void;
}

function LoadedLocations(props: LoadedLocationsProps): ReactElement {
  const selectedPlace = props.selectedPlace;
  return (
    <PlacesDnd world={props.world} itemDrag={props.itemDrag} placeDrag={props.placeDrag}>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <LocationTree
          tree={props.tree}
          edits={props.edits}
          tallyOf={props.tallies.tallyOf}
          offline={!props.online}
          onOpen={props.onOpen}
          onMove={props.onMove}
          drag={{ world: props.world, placeDrag: props.placeDrag, itemDrag: props.itemDrag }}
        />
        {selectedPlace === null ? null : (
          <PlacePreview
            key={selectedPlace.id}
            place={selectedPlace}
            locationsWorld={props.world}
            tally={props.tallies.tallyOf(selectedPlace.id)}
            edits={props.edits}
            offline={!props.online}
            movingPlace={props.movingPlace}
            onMovingPlaceChange={props.onMovingPlaceChange}
            onOpen={() => props.onOpen(selectedPlace.id)}
            onItemDragChange={props.onItemDragChange}
          />
        )}
      </div>
    </PlacesDnd>
  );
}

/** Chooses the page body for the current Locations request state. */
export function LocationsBody(props: LocationsBodyProps): ReactElement {
  const [itemDragState, setItemDragState] = useState<ItemDragState | null>(null);
  const onPlaceDrop = useCallback(
    (placeId: string, targetId: string, position: DropPosition): void => {
      const order = placeDropOrder(props.world, placeId, targetId, position);
      if (order === null) return;
      if (props.edits.arrange !== undefined) {
        props.edits.arrange(placeId, order.parentId, order.order);
      } else if (position === 'inside') {
        props.edits.moveTo(placeId, order.parentId);
      }
    },
    [props.edits, props.world]
  );
  const placeDrag = usePlaceDrag(props.world, onPlaceDrop);
  const selectedId = props.selectedPlace?.id ?? null;
  const itemDrag =
    selectedId !== null && itemDragState?.placeId === selectedId ? itemDragState.drag : undefined;
  const onItemDragChange = useCallback(
    (drag: DragPlacementApi | undefined): void => {
      if (selectedId === null) return;
      setItemDragState((current) => {
        if (drag === undefined) {
          return current?.placeId === selectedId ? null : current;
        }
        if (current?.placeId === selectedId && current.drag === drag) return current;
        return { placeId: selectedId, drag };
      });
    },
    [selectedId]
  );
  if (props.locations.status === 'error' || props.tallies.status === 'error') {
    return <LocationsError onRetry={props.onRetry} />;
  }
  if (props.locations.status === 'pending' || props.tallies.status === 'pending') {
    return <LocationsLoading />;
  }
  if (props.locations.locations.length === 0 && props.edits.creatingUnder === undefined) {
    return <LocationsEmpty offline={!props.online} onNewPlace={props.onNewPlace} />;
  }
  return (
    <LoadedLocations
      {...props}
      itemDrag={itemDrag}
      placeDrag={placeDrag}
      onItemDragChange={onItemDragChange}
    />
  );
}
