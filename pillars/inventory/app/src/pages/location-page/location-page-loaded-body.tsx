import { OFFLINE_TITLE, StateBanner } from '../../foundation/feedback/state-banner.js';
import { staleTitle, LoadError, LocationSkeleton } from './location-page-state.js';
import { LocationTabBody } from './location-tab-body.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceContentsData } from '../../inventory-web/usePlaceContents.js';
import type { ContentsVerbState } from './location-page-content-verbs.js';
import type { PlaceEditsApi, PlaceTab } from './location-page-parts.js';

/** Renders the loaded location's offline, stale, or mutation-error banner. */
export function LocationBanner({
  place,
  online,
  changed,
  edits,
}: {
  place: LocationModel;
  online: boolean;
  changed: ChangedElsewhere;
  edits: PlaceEditsApi;
}): ReactElement | null {
  const group = changed.groups[0];
  if (!online) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Storing, moving and deleting come back when the connection does."
      />
    );
  }
  if (changed.stale && group !== undefined) {
    return (
      <StateBanner
        kind="stale"
        title={staleTitle(place.name, group)}
        detail="Your selection stays until you reload."
        actionLabel="Reload"
        onAction={() => void changed.reload()}
      />
    );
  }
  if (edits.error !== null) {
    return (
      <StateBanner
        kind="error"
        title={edits.error}
        actionLabel="Dismiss"
        onAction={edits.clearError}
      />
    );
  }
  return null;
}

/** Renders either the location contents, its loading state, or its retry state. */
export function LocationBody({
  place,
  contents,
  edits,
  world,
  contentVerbs,
  tab,
  query,
  online,
  tallyOf,
  onStoreHere,
  onOpenPlace,
  onOpenItem,
  onClearQuery,
  onRetry,
}: {
  place: LocationModel;
  contents: PlaceContentsData;
  edits: PlaceEditsApi;
  world: PlacementWorld;
  contentVerbs: ContentsVerbState;
  tab: PlaceTab;
  query: string;
  online: boolean;
  tallyOf: (id: string) => PlaceTally;
  onStoreHere: () => void;
  onOpenPlace: (id: string) => void;
  onOpenItem: (id: string, ids: readonly string[]) => void;
  onClearQuery: () => void;
  onRetry: () => void;
}): ReactElement {
  if (contents.status === 'pending') return <LocationSkeleton />;
  if (contents.status === 'error') {
    return (
      <LoadError
        title={`${place.name} did not load`}
        detail="The inventory service did not answer. Nothing was changed."
        onRetry={onRetry}
      />
    );
  }
  return (
    <LocationTabBody
      place={place}
      tab={tab}
      query={query}
      world={world}
      edits={edits}
      verbs={contentVerbs.verbs}
      tallyOf={tallyOf}
      offline={!online}
      onStoreHere={onStoreHere}
      onClearQuery={onClearQuery}
      onOpenPlace={onOpenPlace}
      onOpenItem={onOpenItem}
    />
  );
}
