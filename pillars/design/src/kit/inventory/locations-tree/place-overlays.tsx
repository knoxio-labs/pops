/**
 * What floats over both place pages: the In hand strip while dragging, the
 * placement picker for a Move of things, the delete confirmation, and the
 * Store here sheet for the current place.
 */
import { StoreHereStub } from '../location-page/store-here-stub';
import { DeletePlaceDialog } from './delete-place-dialog';
import { InHandStrip } from './in-hand-strip';
import { MoveItemsAnchor } from './move-controls';

import type { LocationModel, PlacementTarget } from '../foundation';
import type { ItemActionsApi } from '../location-page/use-item-actions';
import type { LocationsApi } from './use-locations';

/** Props for {@link PlaceOverlays}. */
export interface PlaceOverlaysProps {
  api: LocationsApi;
  verbs: ItemActionsApi;
  place: LocationModel | null;
  recents: readonly PlacementTarget[];
  storing: boolean;
  onStoringChange: (open: boolean) => void;
}

/** The overlays. */
export function PlaceOverlays({
  api,
  verbs,
  place,
  recents,
  storing,
  onStoringChange,
}: PlaceOverlaysProps) {
  return (
    <>
      <InHandStrip api={api} />
      <MoveItemsAnchor world={api.world} verbs={verbs} recents={recents} />
      <DeletePlaceDialog
        world={api.world}
        pending={api.edits.deleting}
        onModeChange={api.edits.setDeleteMode}
        onConfirm={api.edits.confirmDelete}
        onCancel={api.edits.cancelDelete}
      />
      {place ? (
        <StoreHereStub
          open={storing}
          onOpenChange={onStoringChange}
          target={{ kind: 'location', id: place.id, name: place.name }}
          world={api.world}
        />
      ) : null}
    </>
  );
}
