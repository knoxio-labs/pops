import { MapPin } from 'lucide-react';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { DeletePlaceDialog } from '../location-page/location-page-delete-dialog.js';
import { LocationsBody } from './locations-page-body.js';
import { pageBanner, PageAction } from './locations-page-chrome.js';
import { useLocationsPageModel } from './locations-page-model.js';

import type { ReactElement } from 'react';

function countPlaces(count: number): string {
  return `${count} ${count === 1 ? 'place' : 'places'}.`;
}

/** Renders the Locations tree, selected-place panel, edits, and page states. */
export function LocationTreePage(): ReactElement {
  const model = useLocationsPageModel();
  return (
    <InventoryPage
      title="Locations"
      icon={MapPin}
      description={countPlaces(model.locations.locations.length)}
      actions={
        <PageAction
          selectedName={model.selectedPlace?.name ?? null}
          offline={!model.online}
          onNewPlace={model.startCreate}
        />
      }
      banner={pageBanner(model.online, model.changed)}
      bodyClassName="min-h-0"
      overlay={
        <DeletePlaceDialog
          state={model.edits.deleting}
          onCancel={model.edits.cancelDelete}
          onConfirm={model.edits.confirmDelete}
        />
      }
    >
      <LocationsBody
        locations={model.locations}
        tallies={model.tallies}
        world={model.world}
        tree={model.tree}
        edits={model.edits}
        online={model.online}
        selectedPlace={model.selectedPlace}
        movingPlace={model.movingPlace}
        onMovingPlaceChange={model.setMovingPlace}
        onRetry={model.retry}
        onOpen={model.openPlace}
        onMove={model.onMove}
        onNewPlace={model.startCreate}
      />
    </InventoryPage>
  );
}
