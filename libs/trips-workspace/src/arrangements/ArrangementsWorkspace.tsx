import { useState } from 'react';

import { Button, ErrorState, PageHeader } from '@pops/ui';

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
import { ResponsibilitySessions } from './ResponsibilitySessions';
import { visitTitle } from './source-labels';
import { SourceDialog } from './SourceDialog';
import { useArrangementSource } from './use-arrangement-source';
import { useArrangements } from './use-arrangements';
import { useGapCapture } from './use-gap-capture';
import { VisitCoverage } from './VisitCoverage';

import type { JSX } from 'react';

import type {
  ArrangementFilters as Filters,
  ArrangementGroup,
  ArrangementSources,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
} from './types';
import type { GapCapture } from './use-gap-capture';

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
  const { sources, queries, pending, complete, coverageComplete, refresh } =
    useArrangements(identity);
  const [filters, setFilters] = useState<Filters>({ query: '', kind: '', purchase: '' });
  const source = useArrangementSource(identity);
  const capture = useGapCapture(identity, source.open);
  const rows = filterArrangements(arrangementRows(sources), filters, sources);
  const groups = groupArrangements(rows, sources.visits);
  return (
    <ResponsibilitySessions>
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
        <GapProblems capture={capture} identity={identity} />
        <RouteGroups
          groups={groups}
          sources={sources}
          identity={identity}
          capture={capture}
          complete={coverageComplete}
          open={source.open}
        />
        {source.selection && (
          <SourceDialog
            target={source.selection.target}
            identity={identity}
            sources={sources}
            close={() => {
              source.close();
              void refresh();
            }}
            viewJourney={(targetId) => source.open({ targetKind: 'journey', targetId })}
            documents={source.selection.documents}
          />
        )}
      </main>
    </ResponsibilitySessions>
  );
}
function groupLabel(
  group: ArrangementGroup,
  sources: ArrangementSources,
  identity: ArrangementsWorkspaceProps
): string {
  if (group.id === 'journeys') return identity.labels.journey;
  if (group.unavailableVisitId !== undefined) return identity.labels.visitUnavailable;
  if (!group.visit) return identity.labels.noVisit;
  return visitTitle(group.visit, sources, identity.labels);
}

function SourceProblems({
  queries,
}: Pick<ReturnType<typeof useArrangements>, 'queries'>): JSX.Element {
  return (
    <>
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

function RouteGroups({
  groups,
  sources,
  identity,
  capture,
  complete,
  open,
}: {
  groups: ArrangementGroup[];
  sources: ArrangementSources;
  identity: ArrangementsWorkspaceProps;
  capture: GapCapture;
  complete: boolean;
  open: (target: ArrangementTarget) => void;
}): JSX.Element {
  return (
    <div className="space-y-6">
      {groups
        .filter((group) => group.rows.length > 0 || group.visit !== undefined)
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
                open={() => open(arrangementTarget(row))}
              />
            ))}
            {group.visit && (
              <VisitCoverage
                visit={group.visit}
                sources={sources}
                identity={identity}
                complete={complete}
                capture={capture}
              />
            )}
          </section>
        ))}
    </div>
  );
}
function GapProblems({
  capture,
  identity,
}: {
  capture: GapCapture;
  identity: ArrangementsWorkspaceProps;
}): JSX.Element | null {
  if (capture.failure === undefined) return null;
  return (
    <>
      <ErrorState error={requestProblem(capture.failure)} />
      {capture.uncertain && (
        <p role="status" className="text-sm text-muted-foreground">
          {identity.labels.creationUncertain}
        </p>
      )}
      <Button
        variant="ghost"
        className="min-h-11"
        disabled={capture.busy}
        onClick={() => void capture.reload()}
      >
        {identity.labels.reload}
      </Button>
      {capture.uncertain && (
        <Button
          variant="outline"
          className="min-h-11"
          disabled={capture.busy}
          onClick={capture.beginNew}
        >
          {identity.labels.beginNewStay}
        </Button>
      )}
    </>
  );
}
