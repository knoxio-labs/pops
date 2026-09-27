import { LocationBody } from './location-page-loaded-body.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ContentsVerbs as BulkContentsVerbs } from '../../foundation/places/use-contents-verbs.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceContentsData } from '../../inventory-web/usePlaceContents.js';
import type { ContentsVerbState } from './location-page-content-verbs.js';
import type { LoadedLocationState } from './location-page-loaded-state.js';
import type { LocationNavigation } from './location-page-loaded-types.js';
import type { PlaceEditsApi, PlaceTab } from './location-page-parts.js';

/** Renders the content portion of a loaded location view. */
export function LocationContent({
  place,
  world,
  tallyOf,
  online,
  edits,
  contents,
  state,
  contentVerbs,
  bulkVerbs,
  tab,
  navigation,
}: {
  place: LocationModel;
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  online: boolean;
  edits: PlaceEditsApi;
  contents: PlaceContentsData;
  state: LoadedLocationState;
  contentVerbs: ContentsVerbState;
  bulkVerbs?: BulkContentsVerbs;
  tab: PlaceTab;
  navigation: LocationNavigation;
}): ReactElement {
  return (
    <LocationBody
      place={place}
      contents={contents}
      edits={edits}
      world={world}
      contentVerbs={contentVerbs}
      bulkVerbs={bulkVerbs}
      tab={tab}
      query={state.query}
      online={online}
      tallyOf={tallyOf}
      onStoreHere={() => state.setStoreHereOpen(true)}
      onOpenPlace={navigation.openPlace}
      onOpenItem={navigation.openItem}
      onClearQuery={() => state.setQuery('')}
      onRetry={contents.refetch}
    />
  );
}
