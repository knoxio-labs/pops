import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { LocationEdits } from './location-tree.js';

/** Props for the selected-place preview beside the locations tree. */
export interface PlacePreviewProps {
  readonly place: LocationModel;
  readonly locationsWorld: PlacementWorld;
  readonly tally: PlaceTally;
  readonly edits: LocationEdits;
  readonly offline: boolean;
  readonly movingPlace: boolean;
  readonly onMovingPlaceChange: (open: boolean) => void;
  readonly onOpen: () => void;
  readonly onItemDragChange?: (drag: DragPlacementApi | undefined) => void;
}
