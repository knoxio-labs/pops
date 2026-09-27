import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { useItemVerbs } from '../../inventory-web/item-verbs.js';
import { labelsHref } from '../../pages/labels-page/label-params.js';
import { PlacementPicker } from '../placement-picker/placement-picker.js';
import { BulkMoveSheet, usePlacementController } from './bulk-move-sheet.js';
import {
  carriedCount,
  copyCodes,
  createRowVerbHandler,
  itemSelectionActions,
  selectionActionHandlers,
} from './selection-actions.js';
import { useListWriteActions } from './selection-dock.js';
import { extraDisabledReason, listShortcutHandlers } from './take-out.js';

import type { ReactElement, ReactNode, RefObject } from 'react';

import type { RowVerbId } from '../items-table/items-table.js';
import type { ItemRowModel, SelectionBarAction } from '../model/index.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { SelectionApi } from '../selection/use-selection.js';
import type { ShortcutHandlers } from '../shortcuts/shortcut-provider.js';
import type { SelectionActionId, SelectionHandlers } from './selection-actions.js';
import type { TrackWrite, TrackedWrites } from './take-out.js';

export { useTrackedWrites } from './take-out.js';
export type { TrackedWrites } from './take-out.js';

/** Inputs required to bind item placement verbs to one list page. */
export interface ListVerbsInput {
  rows: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  contentCounts: Readonly<Record<string, { direct: number; deep: number }>>;
  offline: boolean;
  tracked: TrackedWrites;
  extraHandlers?: SelectionHandlers;
  extraDisabledReasons?: Partial<Record<SelectionActionId, string>>;
}

/** Placement handlers, list shortcuts, and overlays owned by an inventory list page. */
export interface ListVerbs {
  actions: SelectionBarAction[];
  carried: number;
  dockAnchorRef: RefObject<HTMLDivElement | null>;
  onRowVerb: (verb: RowVerbId, item: ItemRowModel, anchor?: Element | null) => void;
  rejections: Readonly<Record<string, string>>;
  track: TrackWrite;
  keyHandlers: ShortcutHandlers;
  overlays: ReactNode;
}

function listControls(
  input: ListVerbsInput & {
    navigate: ReturnType<typeof useNavigate>;
    writes: ReturnType<typeof useListWriteActions>;
    placement: ReturnType<typeof usePlacementController>;
  }
): Pick<ListVerbs, 'actions' | 'keyHandlers'> {
  const ids = input.selection.selectedIds;
  const handlers = {
    ...selectionActionHandlers({
      world: input.world,
      ids,
      offline: input.offline,
      onPickUp: () => void input.writes.runBulkPickUp(ids),
      onMove: () => input.placement.openPicker(ids, 'bulk'),
      onTakeOut: () => void input.writes.runTakeOut(ids),
      onLabel: () => void input.navigate(labelsHref(ids)),
      onCopyCodes: () => copyCodes(input.rows, ids),
    }),
    ...input.extraHandlers,
  };
  const actions = itemSelectionActions(input.world, ids, handlers).map((action) => {
    const reason = extraDisabledReason(input.extraDisabledReasons, action.id);
    return reason === undefined ? action : { ...action, disabledReason: reason };
  });
  const keyHandlers = listShortcutHandlers({
    rows: input.rows,
    world: input.world,
    selection: input.selection,
    offline: input.offline,
    runLabels: (selected) => void input.navigate(labelsHref(selected)),
    openPicker: input.placement.openPicker,
    runBulkPickUp: input.writes.runBulkPickUp,
    runPickUp: input.writes.runPickUp,
    runTakeOut: input.writes.runTakeOut,
    runPutBack: input.writes.runPutBack,
    setRejection: input.tracked.setRejection,
  });
  return { actions, keyHandlers };
}

/** Binds item selection actions, row verbs, keyboard shortcuts, and placement overlays. */
export function useListVerbs(input: ListVerbsInput): ListVerbs {
  const { rows, world, selection, contentCounts, offline, tracked } = input;
  const navigate = useNavigate();
  const single = useItemVerbs();
  const bulk = useBulkItemVerbs();
  const writes = useListWriteActions({ single, bulk, tracked, world });
  const placement = usePlacementController({
    rows,
    onBulkPickUp: writes.runBulkPickUp,
    onRowMove: writes.runRowMove,
  });
  const onRowVerb = createRowVerbHandler({
    offline,
    world,
    setRejection: tracked.setRejection,
    runPickUp: writes.runPickUp,
    runPutBack: writes.runPutBack,
    openPicker: placement.openPicker,
  });

  const controls = listControls({ ...input, navigate, writes, placement });

  const overlays = <ListOverlays placement={placement} writes={writes} />;

  return {
    actions: controls.actions,
    carried: carriedCount(selection.selectedIds, contentCounts, world),
    dockAnchorRef: placement.dockAnchorRef,
    onRowVerb,
    rejections: tracked.rejections,
    track: tracked.track,
    keyHandlers: controls.keyHandlers,
    overlays,
  };
}

function ListOverlays({
  placement,
  writes,
}: {
  placement: ReturnType<typeof usePlacementController>;
  writes: ReturnType<typeof useListWriteActions>;
}): ReactElement {
  const [moveBusy, setMoveBusy] = useState(false);
  const apply = (): void => {
    const plan = placement.movePlan;
    if (plan === null || moveBusy) return;
    setMoveBusy(true);
    void writes
      .runBulkMove(plan, () => placement.setMoveSheetOpen(false))
      .finally(() => setMoveBusy(false));
  };
  return (
    <>
      <PlacementOverlay placement={placement} />
      {placement.movePlan !== null ? (
        <BulkMoveSheet
          open={placement.moveSheetOpen}
          onOpenChange={placement.setMoveSheetOpen}
          plan={placement.movePlan}
          world={placement.planWorld ?? placement.moveWorld}
          busy={moveBusy}
          onApply={apply}
          onChangeTarget={() => {
            placement.setMoveSheetOpen(false);
            placement.openPicker(placement.pickerIds, 'bulk');
          }}
        />
      ) : null}
    </>
  );
}

function PlacementOverlay({
  placement,
}: {
  placement: ReturnType<typeof usePlacementController>;
}): ReactElement {
  return (
    <PlacementPicker
      open={placement.pickerOpen}
      onOpenChange={placement.setPickerOpen}
      trigger={
        <span
          data-placement-picker-trigger
          aria-hidden="true"
          className="fixed size-0"
          style={{ top: placement.anchor.top, left: placement.anchor.left }}
        />
      }
      world={placement.moveWorld}
      subject={placement.pickerSubject}
      recents={placement.sources.recents}
      onPick={placement.onPickerPick}
      onCreatePlace={(name, parentId) => {
        placement.sources.createLocation.mutate({ name, parentId });
      }}
    />
  );
}
