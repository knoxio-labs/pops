import { useQuery } from '@tanstack/react-query';

import { RentalContextEditor } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { readOwner } from './api/read-owner';
import { loadPlaces, loadVisits, sourceProblem, tripKeys } from './api/source';
import { useArrangementLabels } from './arrangements/use-arrangement-labels';
import { client as defaultClient } from './trips-api/client.gen';

import type { RentalContextEditorProps } from '@pops/trips-workspace';

/** Read optional owning Visit/Place context while preserving the exact canonical Rental editor. */
export function TimelineRental({
  tripId,
  client,
  id,
}: {
  tripId: number;
  client?: RentalContextEditorProps['identity']['client'];
  id: number;
}) {
  const labels = useArrangementLabels();
  const clients = { tripClient: client };
  const keys = tripKeys(clients);
  const owner = client ?? defaultClient;
  const origin = owner.getConfig().baseUrl;
  const visits = useQuery({
    queryKey: keys.visits(tripId),
    queryFn: () => readOwner(owner, origin, () => loadVisits(tripId, clients)),
    retry: false,
  });
  const places = useQuery({
    queryKey: keys.places,
    queryFn: () => readOwner(owner, origin, () => loadPlaces(clients)),
    retry: false,
  });
  return (
    <>
      {[
        { kind: 'visits', query: visits },
        { kind: 'places', query: places },
      ].map(({ kind, query }) =>
        query.isError ? (
          <ErrorState
            key={kind}
            error={sourceProblem(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : null
      )}
      <RentalContextEditor
        identity={{ tripId, client, labels }}
        id={id}
        sources={{ visits: visits.data, places: places.data }}
      />
    </>
  );
}
