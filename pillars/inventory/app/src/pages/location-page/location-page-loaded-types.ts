import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceContentsData } from '../../inventory-web/usePlaceContents.js';
import type { LoadedLocationState } from './location-page-loaded-state.js';
import type { PlaceEditsApi, PlaceTab } from './location-page-parts.js';

/** Navigation callbacks used by the loaded location view. */
export interface LocationNavigation {
  readonly openTab: (tab: PlaceTab) => void;
  readonly openPlace: (id: string) => void;
  readonly openItem: (id: string, ids: readonly string[]) => void;
  readonly openNewItem: () => void;
}

/** Props for the loaded location page view. */
export interface LoadedLocationViewProps {
  place: LocationModel;
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  online: boolean;
  edits: PlaceEditsApi;
  contents: PlaceContentsData;
  state: LoadedLocationState;
  tab: PlaceTab;
  navigation: LocationNavigation;
}
