import { Sheet } from '@pops/ui';

import { LifecycleDialog } from '../../../foundation/lifecycle/lifecycle-dialog.js';
import { MovePlanPanel } from '../../../foundation/move-plan/move-plan.js';
import { PlacementPicker } from '../../../foundation/placement-picker/placement-picker.js';
import { StoreHereSheet } from '../../../foundation/store-here/store-here-sheet.js';

import type { ReactElement } from 'react';

import type { StoreHereTarget } from '../../../foundation/model/contracts.js';
import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { PendingLifecycle } from './container-lifecycle.js';
import type { ContainerPlacementState } from './container-placement.js';
import type { ContainerWorkspaceProps } from './workspace-types.js';

function PlacementDialog({
  placement,
  world,
  recents,
  createPlace,
  onPick,
}: {
  placement: ContainerPlacementState;
  world: PlacementWorld;
  recents: ContainerWorkspaceProps['recents'];
  createPlace: ContainerWorkspaceProps['createPlace'];
  onPick: (target: PlacementTarget) => void;
}): ReactElement {
  return (
    <PlacementPicker
      trigger={<span aria-hidden className="fixed top-0 left-0 size-px" />}
      open={placement.pickerOpen}
      onOpenChange={placement.onPickerOpenChange}
      world={world}
      subject={{ kind: 'items', ids: placement.moveIds }}
      recents={recents}
      onPick={onPick}
      onCreatePlace={(name, parentId) => {
        void createPlace(name, parentId);
      }}
    />
  );
}

function MoveDialog({
  placement,
  world,
  moveBusy,
  runMove,
}: {
  placement: ContainerPlacementState;
  world: PlacementWorld;
  moveBusy: boolean;
  runMove: () => Promise<void>;
}): ReactElement | null {
  if (placement.movePlan === null) return null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !moveBusy) placement.clearMove();
      }}
      title={`Move ${placement.moveIds.length === 1 ? '1 item' : `${placement.moveIds.length} items`}`}
      description="Check what moves before anything does."
    >
      <MovePlanPanel
        plan={placement.movePlan}
        world={world}
        onApply={() => void runMove()}
        onCancel={placement.clearMove}
        onChangeTarget={() => {
          placement.setMoveTarget(null);
          placement.setPickerOpen(true);
        }}
        busy={moveBusy}
      />
    </Sheet>
  );
}

function LifecycleAndStoreDialogs({
  lifecycle,
  onLifecycleChange,
  onLifecycleConfirm,
  storeHereOpen,
  onStoreHereChange,
  storeTarget,
  offline,
  readOnly,
}: {
  lifecycle: PendingLifecycle | undefined;
  onLifecycleChange: (open: boolean) => void;
  onLifecycleConfirm: (reason: string | null) => Promise<void>;
  storeHereOpen: boolean;
  onStoreHereChange: ContainerWorkspaceProps['onStoreHereChange'];
  storeTarget: StoreHereTarget;
  offline: boolean;
  readOnly: boolean;
}): ReactElement {
  return (
    <>
      {lifecycle ? (
        <LifecycleDialog
          act={lifecycle.act}
          subject={lifecycle.ids.length}
          open
          onOpenChange={onLifecycleChange}
          onConfirm={(reason) => void onLifecycleConfirm(reason)}
        />
      ) : null}
      {!readOnly ? (
        <StoreHereSheet
          open={storeHereOpen}
          onOpenChange={onStoreHereChange}
          target={storeTarget}
          offline={offline}
        />
      ) : null}
    </>
  );
}

/** Renders placement, bulk lifecycle, and store-here dialogs for the workspace. */
export function WorkspaceDialogs({
  placement,
  world,
  recents,
  createPlace,
  onPick,
  moveBusy,
  runMove,
  lifecycle,
  onLifecycleChange,
  onLifecycleConfirm,
  storeHereOpen,
  onStoreHereChange,
  storeTarget,
  offline,
  readOnly,
}: {
  placement: ContainerPlacementState;
  world: PlacementWorld;
  recents: ContainerWorkspaceProps['recents'];
  createPlace: ContainerWorkspaceProps['createPlace'];
  onPick: (target: PlacementTarget) => void;
  moveBusy: boolean;
  runMove: () => Promise<void>;
  lifecycle: PendingLifecycle | undefined;
  onLifecycleChange: (open: boolean) => void;
  onLifecycleConfirm: (reason: string | null) => Promise<void>;
  storeHereOpen: boolean;
  onStoreHereChange: ContainerWorkspaceProps['onStoreHereChange'];
  storeTarget: StoreHereTarget;
  offline: boolean;
  readOnly: boolean;
}): ReactElement {
  return (
    <>
      <PlacementDialog
        placement={placement}
        world={world}
        recents={recents}
        createPlace={createPlace}
        onPick={onPick}
      />
      <MoveDialog placement={placement} world={world} moveBusy={moveBusy} runMove={runMove} />
      <LifecycleAndStoreDialogs
        lifecycle={lifecycle}
        onLifecycleChange={onLifecycleChange}
        onLifecycleConfirm={onLifecycleConfirm}
        storeHereOpen={storeHereOpen}
        onStoreHereChange={onStoreHereChange}
        storeTarget={storeTarget}
        offline={offline}
        readOnly={readOnly}
      />
    </>
  );
}
