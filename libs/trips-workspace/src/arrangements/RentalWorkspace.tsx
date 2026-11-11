import { ErrorState } from '@pops/ui';

import { useSessionView } from '../shared/use-session-view';
import { useSourceQuery } from '../shared/use-source-query';
import { requestProblem } from '../stay/api';
import { loadRental } from './api';
import { rentalCacheKey } from './rental-cache';
import { RentalEditor } from './RentalEditor';

import type { JSX } from 'react';

import type { RentalContextEditorProps } from './rental-context';
import type { Rental } from './types';

/** Load one exact Rental in its retained owner context; a changed connection requires explicit reopening. */
export function RentalWorkspace({
  identity,
  id,
  sources,
  saved,
}: RentalContextEditorProps): JSX.Element {
  const query = useSourceQuery(
    { client: identity.client, tripId: identity.tripId, kind: 'rental', sourceId: id },
    (owner) => {
      const key = rentalCacheKey(owner);
      return {
        queryKey: key,
        load: async () => {
          const incoming = await loadRental(
            { client: owner.client, tripId: owner.tripId },
            owner.sourceId
          );
          const current = owner.scope.getQueryData<Rental>(key);
          return current && current.revision > incoming.revision ? current : incoming;
        },
      };
    }
  );
  const view = useSessionView(query.owner);
  const source = query.ownershipError ? undefined : query.data;
  const error = query.ownershipError ?? query.error;
  return (
    <>
      {query.isPending && !error && <p role="status">{identity.labels.loading}</p>}
      {error && (
        <ErrorState
          error={requestProblem(error)}
          onRetry={() => {
            if (view.isCurrent()) void query.refetch();
          }}
        />
      )}
      {source && (
        <RentalEditor
          identity={{ ...identity, client: query.owner.client, tripId: query.owner.tripId }}
          source={source}
          sources={sources}
          saved={(rental) => {
            if (view.isCurrent()) saved?.(rental);
          }}
          reload={async () => {
            if (!view.isCurrent()) return;
            const result = await query.refetch();
            return result.isSuccess && view.isCurrent() ? result.data : undefined;
          }}
        />
      )}
    </>
  );
}
