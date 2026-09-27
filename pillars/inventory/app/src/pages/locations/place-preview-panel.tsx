import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { StoreHereDialog } from '../location-page/location-page-state.js';
import { ContentsSelectionBar } from '../location-page/location-tab-selection-bar.js';
import { ContentState } from './place-preview-content-state.js';
import { PreviewHeader } from './place-preview-header.js';
import { ItemLists } from './place-preview-lists.js';

import type { ReactElement } from 'react';

import type { PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { PlaceContentsData } from '../../inventory-web/usePlaceContents.js';
import type { ContentsVerbs, PlaceContents } from '../location-page/location-tab-content-model.js';
import type { PlacePreviewProps } from './place-preview.js';

/** Props for the selected-place preview surface and its overlay actions. */
export interface PreviewPanelProps {
  readonly props: PlacePreviewProps;
  readonly contentsData: Pick<PlaceContentsData, 'status' | 'refetch'>;
  readonly contents: PlaceContents;
  readonly world: PlacementWorld;
  readonly selection: SelectionApi;
  readonly verbs: ContentsVerbs;
  readonly onOpenItem: (id: string, ids: readonly string[]) => void;
  readonly onStoreHere: () => void;
  readonly storeHereOpen: boolean;
  readonly onCloseStoreHere: () => void;
  readonly onCreateItem: () => void;
  readonly movingItemIds: readonly string[];
  readonly onMovingItemsChange: (ids: readonly string[]) => void;
  readonly onMoveItems: (target: PlacementTarget) => void;
}

function PreviewSurface(props: PreviewPanelProps): ReactElement {
  return (
    <section
      aria-label={props.props.place.name}
      data-location-preview
      className="hidden min-h-0 flex-col rounded-xl border bg-card lg:flex"
    >
      <PreviewHeader
        place={props.props.place}
        world={props.props.locationsWorld}
        tally={props.props.tally}
        edits={props.props.edits}
        offline={props.props.offline}
        movingPlace={props.props.movingPlace}
        onMovingPlaceChange={props.props.onMovingPlaceChange}
        onOpen={props.props.onOpen}
        onStoreHere={props.onStoreHere}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <ContentState
          place={props.props.place}
          status={props.contentsData.status}
          onRetry={props.contentsData.refetch}
        >
          <ItemLists
            place={props.props.place}
            contents={props.contents}
            world={props.world}
            selection={props.selection}
            verbs={props.verbs}
            onOpenItem={props.onOpenItem}
            onStoreHere={props.onStoreHere}
          />
        </ContentState>
      </div>
    </section>
  );
}

function PreviewSelection(props: PreviewPanelProps): ReactElement | null {
  if (props.selection.count === 0) return null;
  return (
    <div className="hidden lg:col-span-2 lg:block">
      <ContentsSelectionBar world={props.world} selection={props.selection} verbs={props.verbs} />
    </div>
  );
}

function PreviewOverlays(props: PreviewPanelProps): ReactElement {
  return (
    <>
      <PlacementPicker
        world={props.world}
        subject={{ kind: 'items', ids: props.movingItemIds }}
        recents={[]}
        open={props.movingItemIds.length > 0}
        onOpenChange={(open) => {
          if (!open) props.onMovingItemsChange([]);
        }}
        onPick={props.onMoveItems}
        trigger={<span className="hidden" aria-hidden />}
      />
      <StoreHereDialog
        open={props.storeHereOpen}
        place={props.props.place}
        onClose={props.onCloseStoreHere}
        onCreate={props.onCreateItem}
      />
    </>
  );
}

/** Renders the selected place panel, selection bar, and placement overlays. */
export function PreviewPanel(props: PreviewPanelProps): ReactElement {
  return (
    <>
      <PreviewSurface {...props} />
      <PreviewSelection {...props} />
      <PreviewOverlays {...props} />
    </>
  );
}
