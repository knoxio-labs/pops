import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDragPlacement } from '../../foundation/drag/use-drag-placement.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { useContentsVerbs as useBulkContentsVerbs } from '../../foundation/places/use-contents-verbs.js';
import { useSelection } from '../../foundation/selection/use-selection.js';
import { usePlaceContents } from '../../inventory-web/usePlaceContents.js';
import { useContentsVerbs } from '../location-page/location-page-content-verbs.js';
import { placeContents } from '../location-page/location-tab-content-model.js';
import { PreviewPanel } from './place-preview-panel.js';
import { usePreviewCommands } from './use-preview-commands.js';
import { usePreviewShortcuts } from './use-preview-shortcuts.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { PlacementTarget } from '../../foundation/model/model.js';
import type { ContentsVerbs as BulkContentsVerbs } from '../../foundation/places/use-contents-verbs.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { PlacePreviewProps } from './place-preview-types.js';

function usePreviewDrag(
  world: ReturnType<typeof buildWorld>,
  verbs: BulkContentsVerbs,
  onChange: PlacePreviewProps['onItemDragChange']
): DragPlacementApi {
  const moveIds = verbs.moveIds;
  const onDrop = useCallback(
    (ids: readonly string[], target: PlacementTarget): void => {
      moveIds(ids, target, world);
    },
    [moveIds, world]
  );
  const itemDrag = useDragPlacement(world, onDrop);
  useEffect(() => {
    onChange?.(itemDrag);
  }, [itemDrag, onChange]);
  return itemDrag;
}

function usePreviewPanelActions({
  commands,
  selection,
  order,
  itemActions,
  setStoreHereOpen,
}: {
  commands: ReturnType<typeof usePreviewCommands>;
  selection: SelectionApi;
  order: readonly string[];
  itemActions: ReturnType<typeof useContentsVerbs>;
  setStoreHereOpen: (open: boolean) => void;
}): {
  openItem: ReturnType<typeof usePreviewCommands>['openItem'];
  openStoreHere: () => void;
  closeStoreHere: () => void;
  createItem: () => void;
} {
  const openItem = commands.openItem;
  const openStoreHere = useCallback((): void => setStoreHereOpen(true), [setStoreHereOpen]);
  const closeStoreHere = useCallback((): void => setStoreHereOpen(false), [setStoreHereOpen]);
  const createItem = useCallback((): void => {
    setStoreHereOpen(false);
    commands.createItem();
  }, [commands, setStoreHereOpen]);
  usePreviewShortcuts({ selection, order, itemActions, onOpenItem: openItem });
  return { openItem, openStoreHere, closeStoreHere, createItem };
}

function usePreviewItemActions(
  world: ReturnType<typeof buildWorld>,
  offline: boolean,
  movingItemIds: readonly string[],
  setMovingItemIds: (ids: readonly string[]) => void
): ReturnType<typeof useContentsVerbs> {
  return useContentsVerbs(world, !offline, movingItemIds, setMovingItemIds);
}

function usePreviewContents(world: ReturnType<typeof buildWorld>, placeId: string) {
  return useMemo(() => placeContents(world, placeId), [placeId, world]);
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
  const contents = usePreviewContents(contentsWorld, props.place.id);
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
  const itemActions = usePreviewItemActions(
    contentsWorld,
    props.offline,
    movingItemIds,
    setMovingItemIds
  );
  const bulkVerbs = useBulkContentsVerbs({ world: contentsWorld, offline: props.offline });
  const itemDrag = usePreviewDrag(contentsWorld, bulkVerbs, props.onItemDragChange);
  const verbs = useMemo(
    () => ({ ...itemActions.verbs, drag: itemDrag }),
    [itemActions.verbs, itemDrag]
  );
  const commands = usePreviewCommands(props.place);
  const panelActions = usePreviewPanelActions({
    commands,
    selection,
    order,
    itemActions,
    setStoreHereOpen,
  });

  return (
    <PreviewPanel
      props={props}
      contentsData={contentsData}
      contents={contents}
      world={contentsWorld}
      selection={selection}
      verbs={verbs}
      onOpenItem={panelActions.openItem}
      onStoreHere={panelActions.openStoreHere}
      storeHereOpen={storeHereOpen}
      onCloseStoreHere={panelActions.closeStoreHere}
      onCreateItem={panelActions.createItem}
      movingItemIds={itemActions.movingIds}
      onMovingItemsChange={itemActions.setMovingIds}
      onMoveItems={(target: PlacementTarget) => itemActions.moveSelected(target)}
    />
  );
}
