import { MapPin, MapPinOff } from 'lucide-react';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { isNotFoundError } from '../../inventory-api-helpers.js';
import { LoadError, LocationSkeleton, NoSuchPlace } from './location-page-state.js';
import { PlaceGone } from './place-gone.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { WebLocationsGoneResponse } from '../../inventory-api/types.gen.js';

interface GoneDataState {
  status: 'pending' | 'error' | 'success';
  error: unknown;
  data: WebLocationsGoneResponse | undefined;
}

interface GoneStateProps extends GoneDataState {
  onRetry: () => void;
  onBack: () => void;
  onOpenInHand: () => void;
}

function GoneState({
  status,
  error,
  data,
  onRetry,
  onBack,
  onOpenInHand,
}: GoneStateProps): ReactElement {
  if (status === 'pending') {
    return (
      <InventoryPage title="Location" icon={MapPin}>
        <LocationSkeleton />
      </InventoryPage>
    );
  }
  if (status === 'error') {
    return isNotFoundError(error) ? (
      <InventoryPage title="Location" icon={MapPinOff}>
        <NoSuchPlace onBack={onBack} />
      </InventoryPage>
    ) : (
      <InventoryPage title="Location" icon={MapPin}>
        <LoadError
          title="Location"
          detail="The inventory service did not answer. Nothing was changed."
          onRetry={onRetry}
        />
      </InventoryPage>
    );
  }
  if (data !== undefined) {
    return (
      <PlaceGone
        name={data.name}
        inHand={data.inHandCount}
        deletedBy={data.deletedBy?.label}
        onBack={onBack}
        onOpenInHand={onOpenInHand}
      />
    );
  }
  return (
    <InventoryPage title="Location" icon={MapPin}>
      <LocationSkeleton />
    </InventoryPage>
  );
}

/** Renders the route-level load, gone, and deleted-location states. */
export function LocationRouteState({
  locationsStatus,
  talliesStatus,
  place,
  gone,
  onRetryLocations,
  onRetryGone,
  onBack,
  onOpenInHand,
}: {
  locationsStatus: 'pending' | 'error' | 'success';
  talliesStatus: 'pending' | 'error' | 'success';
  place: LocationModel | undefined;
  gone: GoneDataState;
  onRetryLocations: () => void;
  onRetryGone: () => void;
  onBack: () => void;
  onOpenInHand: () => void;
}): ReactElement | null {
  if (locationsStatus === 'error' || talliesStatus === 'error') {
    return (
      <InventoryPage title="Location" icon={MapPin}>
        <LoadError title="Location" detail="Places did not load." onRetry={onRetryLocations} />
      </InventoryPage>
    );
  }
  if (locationsStatus === 'pending' || talliesStatus === 'pending') {
    return (
      <InventoryPage title="Location" icon={MapPin}>
        <LocationSkeleton />
      </InventoryPage>
    );
  }
  if (place === undefined) {
    return (
      <GoneState
        status={gone.status}
        error={gone.error}
        data={gone.data}
        onRetry={onRetryGone}
        onBack={onBack}
        onOpenInHand={onOpenInHand}
      />
    );
  }
  return null;
}
