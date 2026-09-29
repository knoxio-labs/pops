import { useState } from 'react';

import { PlacementPicker } from '../placement-picker/placement-picker.js';
import { BulkActionSheets, type BulkActionState } from './bulk-action-sheets.js';
import { BulkMoveSheet } from './bulk-move-sheet.js';

import type { ReactElement } from 'react';

import type { CatalogueDescriptor } from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel } from '../model/model.js';
import type { BulkFieldInput } from './bulk-action-model.js';
import type { usePlacementController } from './bulk-move-sheet.js';
import type { useListWriteActions } from './selection-dock.js';

/** Props for the list placement picker, move sheet, and typed bulk action sheets. */
export interface ListOverlaysProps {
  readonly placement: ReturnType<typeof usePlacementController>;
  readonly writes: ReturnType<typeof useListWriteActions>;
  readonly bulkAction: BulkActionState | null;
  readonly rows: readonly ItemRowModel[];
  readonly catalogue: CatalogueDescriptor | undefined;
  readonly busy: boolean;
  readonly onActionChange: (open: boolean) => void;
  readonly onSetType: (typeKey: string) => Promise<void>;
  readonly onSetField: (fieldId: string, input: BulkFieldInput) => Promise<void>;
  readonly onLifecycle: (
    act: Extract<BulkActionState['kind'], 'retire' | 'discard'>,
    reason: string | null
  ) => Promise<void>;
}

/** Renders the overlays shared by an inventory list page. */
export function ListOverlays({
  placement,
  writes,
  bulkAction,
  rows,
  catalogue,
  busy,
  onActionChange,
  onSetType,
  onSetField,
  onLifecycle,
}: ListOverlaysProps): ReactElement {
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
      <BulkActionSheets
        action={bulkAction}
        rows={rows}
        catalogue={catalogue}
        busy={busy}
        onOpenChange={onActionChange}
        onSetType={onSetType}
        onSetField={onSetField}
        onLifecycle={onLifecycle}
      />
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
