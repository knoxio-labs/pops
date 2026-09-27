import { LifecycleDialog } from '../../foundation/lifecycle/lifecycle-dialog.js';
import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { DeletePlaceDialog as PlaceDeleteDialog } from '../../foundation/places/delete-place-dialog.js';
import { MoveItemsAnchor } from '../../foundation/places/move-items-anchor.js';
import { PlaceActions } from './location-page-actions.js';
import { DeletePlaceDialog } from './location-page-delete-dialog.js';
import { PlaceToolbar, type PlaceEditsApi, type PlaceTab } from './location-page-parts.js';
import { MoveNotice, RenameInput, StoreHereDialog } from './location-page-state.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { ContentsVerbs as BulkContentsVerbs } from '../../foundation/places/use-contents-verbs.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { LoadedLocationState } from './location-page-loaded-state.js';
import type { LoadedLocationViewProps } from './location-page-loaded-types.js';

/** Renders the location title and its inline rename control. */
export function LocationTitle({
  place,
  edits,
}: Pick<LoadedLocationViewProps, 'place' | 'edits'>): ReactElement {
  return edits.renamingId === place.id ? (
    <RenameInput
      place={place}
      onCommit={edits.commitRename}
      onCancel={() => edits.startRename(null)}
    />
  ) : (
    <>{place.name}</>
  );
}

/** Renders the primary place actions in the location header. */
export function LocationActions({
  place,
  world,
  online,
  edits,
  state,
  navigation,
}: Pick<
  LoadedLocationViewProps,
  'place' | 'world' | 'online' | 'edits' | 'state' | 'navigation'
>): ReactElement {
  return (
    <PlaceActions
      place={place}
      world={world}
      edits={edits}
      movingPlace={state.movingPlace}
      setMovingPlace={state.setMovingPlace}
      showPlaces={() => navigation.openTab('places')}
      onStoreHere={() => state.setStoreHereOpen(true)}
      offline={!online}
    />
  );
}

/** Renders the move notice, tabs, and location-local search input. */
export function LocationToolbar({
  place,
  tallyOf,
  tab,
  state,
  edits,
  onTab,
}: {
  place: LocationModel;
  tallyOf: (id: string) => PlaceTally;
  tab: PlaceTab;
  state: LoadedLocationState;
  edits: PlaceEditsApi;
  onTab: (tab: PlaceTab) => void;
}): ReactElement {
  return (
    <>
      {edits.lastMove !== null ? (
        <MoveNotice
          name={edits.lastMove.name}
          parentName={edits.lastMove.parentName}
          onUndo={edits.lastMove.undo}
          onDismiss={edits.clearMoveNotice}
        />
      ) : null}
      <PlaceToolbar
        place={place}
        tally={tallyOf(place.id)}
        tab={tab}
        onTab={onTab}
        query={state.query}
        onQuery={state.setQuery}
      />
    </>
  );
}

function DeleteOverlay({ edits }: { edits: PlaceEditsApi }): ReactElement {
  return edits.pendingDelete !== undefined &&
    edits.pendingDelete !== null &&
    edits.setDeleteMode !== undefined &&
    edits.confirmDeletePlan !== undefined ? (
    <PlaceDeleteDialog
      pending={edits.pendingDelete}
      onModeChange={edits.setDeleteMode}
      onConfirm={edits.confirmDeletePlan}
      onCancel={edits.cancelDelete}
    />
  ) : (
    <DeletePlaceDialog
      state={edits.deleting}
      onCancel={edits.cancelDelete}
      onConfirm={edits.confirmDelete}
    />
  );
}

function PlacementOverlay({
  world,
  state,
  bulkVerbs,
}: {
  world: LoadedLocationViewProps['world'];
  state: LoadedLocationState;
  bulkVerbs?: BulkContentsVerbs;
}): ReactElement {
  if (bulkVerbs !== undefined) return <MoveItemsAnchor verbs={bulkVerbs} world={world} />;
  return (
    <PlacementPicker
      world={world}
      subject={{ kind: 'items', ids: state.contentVerbs.movingIds }}
      recents={[]}
      open={state.contentVerbs.movingIds.length > 0}
      onOpenChange={(open) => {
        if (!open) state.contentVerbs.setMovingIds([]);
      }}
      onPick={state.contentVerbs.moveSelected}
      trigger={<span className="hidden" aria-hidden />}
    />
  );
}

function LifecycleOverlay({ verbs }: { verbs?: BulkContentsVerbs }): ReactElement | null {
  if (verbs?.lifecycle === null || verbs?.lifecycle === undefined) return null;
  return (
    <LifecycleDialog
      act={verbs.lifecycle.act}
      subject={verbs.lifecycle.ids.length}
      open
      onOpenChange={(open) => {
        if (!open) verbs.cancelLifecycle();
      }}
      onConfirm={verbs.confirmLifecycle}
    />
  );
}

/** Renders the Store here, delete, and item-placement overlays. */
export function LocationOverlays({
  place,
  world,
  state,
  bulkVerbs,
  edits,
  navigation,
}: Pick<LoadedLocationViewProps, 'place' | 'world' | 'state' | 'edits' | 'navigation'> & {
  bulkVerbs?: BulkContentsVerbs;
}): ReactElement {
  return (
    <>
      <StoreHereDialog
        open={state.storeHereOpen}
        place={place}
        onClose={() => state.setStoreHereOpen(false)}
        onCreate={navigation.openNewItem}
      />
      <DeleteOverlay edits={edits} />
      <PlacementOverlay world={world} state={state} bulkVerbs={bulkVerbs} />
      <LifecycleOverlay verbs={bulkVerbs} />
    </>
  );
}
