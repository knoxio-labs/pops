import { LifecycleDialog } from '../lifecycle/lifecycle-dialog.js';
import { StoreHereSheet } from '../store-here/store-here-sheet.js';
import { MoveItemsAnchor } from './move-items-anchor.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { ContentsVerbs } from './use-contents-verbs.js';

/** Props for the shared item-placement and lifecycle overlays of a place. */
export interface PlaceOverlaysProps {
  verbs: ContentsVerbs;
  world: PlacementWorld;
  place: LocationModel;
  storing: boolean;
  onStoringChange: (open: boolean) => void;
}

/** Renders the move picker, Store here sheet, and item lifecycle dialog. */
export function PlaceOverlays({
  verbs,
  world,
  place,
  storing,
  onStoringChange,
}: PlaceOverlaysProps): ReactElement {
  return (
    <>
      <MoveItemsAnchor verbs={verbs} world={world} />
      <StoreHereSheet
        open={storing}
        onOpenChange={onStoringChange}
        target={{ kind: 'location', id: place.id, name: place.name }}
        offline={verbs.disabledReason !== undefined}
      />
      {verbs.lifecycle === null ? null : (
        <LifecycleDialog
          act={verbs.lifecycle.act}
          subject={verbs.lifecycle.ids.length}
          open
          onOpenChange={(open) => {
            if (!open) verbs.cancelLifecycle();
          }}
          onConfirm={verbs.confirmLifecycle}
        />
      )}
    </>
  );
}
