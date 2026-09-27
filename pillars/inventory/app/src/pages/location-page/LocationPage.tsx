import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { buildWorld } from '../../foundation/model/placement-model.js';
import { useLocationTallies } from '../../inventory-web/useLocationTallies.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlaceContents } from '../../inventory-web/usePlaceContents.js';
import { usePlaceEdits } from './location-page-edits.js';
import { LoadedLocationPage } from './location-page-loaded.js';
import { useLocationModels } from './location-page-model.js';
import { useLocationGoneQuery, useRetryLocations } from './location-page-route-query.js';
import { LocationRouteState } from './location-page-route-state.js';

import type { ReactElement } from 'react';

/** Renders a location detail route, including deleted and unavailable states. */
export function LocationPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const pageId = id ?? '';
  const navigate = useNavigate();
  const online = useOnline();
  const locations = useLocationModels();
  const tallies = useLocationTallies();
  const contents = usePlaceContents(pageId);
  const place = locations.locations.find((entry) => entry.id === pageId);
  const world = useMemo(
    () => buildWorld([...contents.world.items.values()], locations.locations),
    [contents.world.items, locations.locations]
  );
  const onDeleted = useCallback(
    (parentId: string | null) => {
      void navigate(
        parentId === null ? '/inventory/locations' : `/inventory/locations/${parentId}`
      );
    },
    [navigate]
  );
  const edits = usePlaceEdits({
    online,
    world,
    tallyOf: tallies.tallyOf,
    onDeleted,
  });
  const goneQuery = useLocationGoneQuery(
    pageId,
    pageId !== '' && locations.status === 'success' && place === undefined
  );
  const retryLocations = useRetryLocations(tallies.refetch);
  const goBack = useCallback(() => void navigate('/inventory/locations'), [navigate]);

  if (locations.status !== 'success' || tallies.status !== 'success' || place === undefined) {
    return (
      <LocationRouteState
        locationsStatus={locations.status}
        talliesStatus={tallies.status}
        place={place}
        gone={goneQuery}
        onRetryLocations={retryLocations}
        onRetryGone={() => void goneQuery.refetch()}
        onBack={goBack}
        onOpenInHand={() => void navigate('/inventory/in-hand')}
      />
    );
  }
  return (
    <LoadedLocationPage
      place={place}
      world={world}
      tallyOf={tallies.tallyOf}
      online={online}
      edits={edits}
      contents={contents}
    />
  );
}
