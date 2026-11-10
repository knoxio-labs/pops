import { useState } from 'react';

import { ErrorState, PageHeader } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { arrangementsKey } from './api';
import { ArrangementCard } from './ArrangementCards';
import { ArrangementFilters } from './ArrangementFilters';
import {
  arrangementRows,
  arrangementTarget,
  filterArrangements,
  groupArrangements,
} from './projection';
import { SourceDialog } from './SourceDialog';
import { useArrangements } from './use-arrangements';

import type { JSX } from 'react';

import type {
  ArrangementFilters as Filters,
  ArrangementGroup,
  ArrangementSources,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
} from './types';

/** Approved Along the route workspace, grouping only actual ordered Visit occurrences and explicit source associations. */
export function ArrangementsWorkspace(props: ArrangementsWorkspaceProps): JSX.Element {
  if (!Number.isSafeInteger(props.tripId) || props.tripId <= 0)
    return (
      <ErrorState
        error={{
          code: 'trips.identity.invalid',
          message: props.labels.invalidIdentity,
          retryable: false,
        }}
      />
    );
  return <ArrangementsSession key={arrangementsKey(props).join(':')} {...props} />;
}
function ArrangementsSession(identity: ArrangementsWorkspaceProps): JSX.Element | null {
  const { sources, queries, pending, complete, refresh } = useArrangements(identity);
  const [filters, setFilters] = useState<Filters>({ query: '', kind: '', purchase: '' });
  const [target, setTarget] = useState<ArrangementTarget>();
  const rows = filterArrangements(arrangementRows(sources), filters, sources);
  const groups = groupArrangements(rows, sources.visits);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <PageHeader
        title={identity.labels.title}
        description={sources.trip?.name ?? undefined}
        backHref={identity.backHref}
      />
      <ArrangementFilters value={filters} onChange={setFilters} labels={identity.labels} />
      <SourceProblems queries={queries} />
      {pending && <p role="status">{identity.labels.loading}</p>}
      {complete && rows.length === 0 && <p role="status">{identity.labels.empty}</p>}
      <div className="space-y-6">
        {groups
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <section
              key={group.id}
              className="space-y-3"
              aria-label={groupLabel(group, sources, identity)}
            >
              <h2 className="text-base font-medium">{groupLabel(group, sources, identity)}</h2>
              {group.rows.map((row) => (
                <ArrangementCard
                  key={`${row.kind}:${row.source.id}`}
                  row={row}
                  sources={sources}
                  identity={identity}
                  open={() => setTarget(arrangementTarget(row))}
                />
              ))}
            </section>
          ))}
      </div>
      {target && (
        <SourceDialog
          target={target}
          identity={identity}
          sources={sources}
          close={() => {
            setTarget(undefined);
            void refresh();
          }}
          viewJourney={(targetId) => setTarget({ targetKind: 'journey', targetId })}
        />
      )}
    </main>
  );
}
function groupLabel(
  group: ArrangementGroup,
  sources: ArrangementSources,
  identity: ArrangementsWorkspaceProps
): string {
  if (group.id === 'journeys') return identity.labels.journey;
  if (group.unavailableVisitId !== undefined)
    return `${identity.labels.visitUnavailable} · ${group.unavailableVisitId}`;
  if (!group.visit) return identity.labels.noVisit;
  return `${sources.places?.find((place) => place.id === group.visit?.placeId)?.name ?? identity.labels.placeUnavailable} · ${group.visit.id}`;
}

function SourceProblems({
  queries,
}: Pick<ReturnType<typeof useArrangements>, 'queries'>): JSX.Element {
  return (
    <>
      {' '}
      {queries.map(({ query, id }) =>
        query.isError ? (
          <ErrorState
            key={id}
            error={requestProblem(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : null
      )}
    </>
  );
}
