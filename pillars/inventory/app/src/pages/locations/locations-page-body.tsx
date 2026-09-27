import { LocationTree, type LocationEdits } from './location-tree.js';
import { LocationsEmpty, LocationsError, LocationsLoading } from './locations-states.js';
import { PlacePreview } from './place-preview.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
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

/** Chooses the page body for the current Locations request state. */
export function LocationsBody(props: LocationsBodyProps): ReactElement {
  if (props.locations.status === 'error' || props.tallies.status === 'error') {
    return <LocationsError onRetry={props.onRetry} />;
  }
  if (props.locations.status === 'pending' || props.tallies.status === 'pending') {
    return <LocationsLoading />;
  }
  if (props.locations.locations.length === 0 && props.edits.creatingUnder === undefined) {
    return <LocationsEmpty offline={!props.online} onNewPlace={props.onNewPlace} />;
  }
  const selectedPlace = props.selectedPlace;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <LocationTree
        tree={props.tree}
        edits={props.edits}
        tallyOf={props.tallies.tallyOf}
        offline={!props.online}
        onOpen={props.onOpen}
        onMove={props.onMove}
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
        />
      )}
    </div>
  );
}
