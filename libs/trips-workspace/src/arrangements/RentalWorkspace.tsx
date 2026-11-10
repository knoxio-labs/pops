import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { arrangementsKey, loadRental } from './api';
import { RentalEditor } from './RentalEditor';

import type { JSX } from 'react';

import type { ArrangementSources, ArrangementsWorkspaceProps, Rental } from './types';

/** Load the exact rental source; cached data remains editable when a background read fails. */
export function RentalWorkspace({
  identity,
  id,
  sources,
  saved,
}: {
  identity: ArrangementsWorkspaceProps;
  id: number;
  sources: ArrangementSources;
  saved: (rental: Rental) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const key = [...arrangementsKey(identity), 'rental', id];
  const query = useQuery({ queryKey: key, queryFn: () => loadRental(identity, id), retry: false });
  const source = query.data;
  return (
    <>
      {query.isPending && <p role="status">{identity.labels.loading}</p>}
      {query.isError && (
        <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
      )}
      {source && (
        <RentalEditor
          identity={identity}
          source={source}
          sources={sources}
          saved={(rental) => {
            queryClient.setQueryData(key, rental);
            saved(rental);
          }}
          reload={async () => {
            const result = await query.refetch();
            return result.isSuccess ? result.data : undefined;
          }}
        />
      )}
    </>
  );
}
