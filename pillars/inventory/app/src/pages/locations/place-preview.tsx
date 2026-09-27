import { useCallback, useMemo, useState } from 'react';

import { buildWorld, type PlacementWorld } from '../../foundation/model/placement-model.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { usePlaceContents } from '../../inventory-web/usePlaceContents.js';
import { useContentsVerbs } from '../location-page/location-page-content-verbs.js';
import { placeContents } from '../location-page/location-tab-content-model.js';
import { PreviewPanel } from './place-preview-panel.js';
import { usePreviewCommands } from './use-preview-commands.js';
import { usePreviewShortcuts } from './use-preview-shortcuts.js';

import type { ReactElement } from 'react';

import type { LocationModel, PlacementTarget } from '../../foundation/model/model.js';
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
}

/** Renders the selected place, its contents states, and item placement actions. */
export function PlacePreview(props: PlacePreviewProps): ReactElement {
  const contentsData = usePlaceContents(props.place.id);
  const contentsWorld = useMemo(
    () =>
      buildWorld(
        [...contentsData.world.items.values()],
        [...props.locationsWorld.locations.values()]
      ),
    [contentsData.world.items, props.locationsWorld.locations]
  );
  const contents = useMemo(
    () => placeContents(contentsWorld, props.place.id),
    [contentsWorld, props.place.id]
  );
  const order = useMemo(
    () => [
      ...contents.here.map((item) => item.id),
      ...contents.boxes.flatMap((group) => group.contents.map((item) => item.id)),
    ],
    [contents]
  );
  const selection = useSelection(order);
  const [movingItemIds, setMovingItemIds] = useState<readonly string[]>([]);
  const [storeHereOpen, setStoreHereOpen] = useState(false);
  const itemActions = useContentsVerbs(
    contentsWorld,
    !props.offline,
    movingItemIds,
    setMovingItemIds
  );
  const commands = usePreviewCommands(props.place);
  const openItem = commands.openItem;
  const openStoreHere = useCallback((): void => setStoreHereOpen(true), []);
  const closeStoreHere = useCallback((): void => setStoreHereOpen(false), []);
  usePreviewShortcuts({ selection, order, itemActions, onOpenItem: openItem });

  return (
    <PreviewPanel
      props={props}
      contentsData={contentsData}
      contents={contents}
      world={contentsWorld}
      selection={selection}
      verbs={itemActions.verbs}
      onOpenItem={openItem}
      onStoreHere={openStoreHere}
      storeHereOpen={storeHereOpen}
      onCloseStoreHere={closeStoreHere}
      onCreateItem={() => {
        setStoreHereOpen(false);
        commands.createItem();
      }}
      movingItemIds={itemActions.movingIds}
      onMovingItemsChange={itemActions.setMovingIds}
      onMoveItems={(target: PlacementTarget) => itemActions.moveSelected(target)}
    />
  );
}
