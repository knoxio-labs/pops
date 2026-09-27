import { Sheet } from '@pops/ui';

import { PlacementPickerPanel } from '../../foundation/placement-picker/placement-picker.js';
import { SearchPreview } from './search-preview.js';

import type { SearchPageState } from './use-search-page.js';

/** Renders the placement picker and the narrow-screen preview sheet. */
export function SearchOverlay({
  state,
  wide,
}: {
  readonly state: SearchPageState;
  readonly wide: boolean;
}) {
  return (
    <>
      <Sheet
        open={state.moveOpen}
        onOpenChange={state.setMoveOpen}
        title="Move selected items"
        description="Choose a place or container for the selected items."
      >
        <PlacementPickerPanel
          world={state.world}
          subject={{ kind: 'items', ids: state.moveIds }}
          recents={state.placement.recents}
          onPick={state.moveTarget}
          onCreatePlace={(name, parentId) => {
            void state.placement.createLocation.mutateAsync({ name, parentId });
          }}
        />
      </Sheet>
      {!wide && state.selectedId !== null ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) state.clearSelected();
          }}
          title="Search preview"
        >
          <SearchPreview state={state} />
        </Sheet>
      ) : null}
    </>
  );
}
