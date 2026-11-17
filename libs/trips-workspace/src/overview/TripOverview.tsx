import { cn, ErrorState } from '@pops/ui';

import { projectTripRoute } from '../route/projection';
import { useTripRoute } from '../route/use-trip-route';
import { requestProblem } from '../stay/api';
import { OverviewCalendar } from './OverviewCalendar';
import { OverviewHeader } from './OverviewHeader';
import { OverviewBeforeYouGo, OverviewSleepPlan } from './OverviewReadiness';
import { OverviewDetached, OverviewReferences } from './OverviewReferences';
import { OverviewRoute } from './OverviewRoute';
import { tripReadiness } from './readiness';
import { useOverviewSources } from './use-overview-sources';

import type { JSX } from 'react';

import type { OverviewSources, TripOverviewProps, OverviewViewProps } from './types';

/** Approved route-first overview, reading each trip-owned source independently through its generated client. */
export function TripOverview(props: TripOverviewProps): JSX.Element | null {
  return <OverviewSession {...props} />;
}

function OverviewSession(props: TripOverviewProps): JSX.Element | null {
  const queries = useOverviewSources(props);
  const route = useTripRoute(props);
  const { trip, ...context } = queries;
  const ownershipError = Object.values(queries).find(
    (query) => query.ownershipError
  )?.ownershipError;
  if (ownershipError) return <ErrorState error={ownershipError} />;
  if (trip.isPending)
    return (
      <p role="status" className="p-4">
        {props.labels.loading}
      </p>
    );
  if (!trip.data)
    return <ErrorState error={requestProblem(trip.error)} onRetry={() => void trip.refetch()} />;
  const sources = overviewSources(context);
  const accommodationComplete =
    context.visits.isSuccess &&
    !context.visits.isFetching &&
    context.stays.isSuccess &&
    !context.stays.isFetching;
  const coverageComplete = accommodationComplete && !route.readError;
  return (
    <OverviewFrame
      {...props}
      queries={queries}
      context={context}
      trip={trip.data}
      sources={sources}
      route={route}
      accommodationComplete={accommodationComplete}
      coverageComplete={coverageComplete}
      projection={route.view ? projectTripRoute(route.view, sources) : undefined}
    />
  );
}

function OverviewFrame({
  queries,
  context,
  ...props
}: OverviewViewProps & {
  queries: ReturnType<typeof useOverviewSources>;
  context: Omit<ReturnType<typeof useOverviewSources>, 'trip'>;
  coverageComplete: boolean;
}): JSX.Element {
  return (
    <div
      data-workspace-layout={props.contextualEditor ? 'split' : 'full'}
      className={cn(
        'trips-workspace grid min-w-0 items-start gap-6 rounded-2xl bg-trip-canvas p-4 font-trip-body text-trip-ink sm:p-6',
        props.contextualEditor && 'xl:grid-cols-3'
      )}
    >
      <main
        className={cn(
          'w-full min-w-0 space-y-5 text-sm',
          props.contextualEditor && 'xl:col-span-2'
        )}
      >
        <OverviewQueryWarnings queries={queries} labels={props.labels} />
        <OverviewContent {...props} />
        <OverviewContextLoading context={context} label={props.labels.loading} />
      </main>
      {props.contextualEditor && (
        <div className="min-w-0 xl:sticky xl:top-6">{props.contextualEditor}</div>
      )}
    </div>
  );
}

function overviewSources(
  context: Omit<ReturnType<typeof useOverviewSources>, 'trip'>
): OverviewSources {
  return {
    visits: context.visits.data,
    places: context.places.data,
    stays: context.stays.data,
    events: context.events.data,
    journeys: context.journeys.data,
    groups: context.groups.data,
    decisions: context.decisions.data,
    documents: context.documents.data,
    meetings: context.meetings.data,
    capture: context.capture.data,
    rentals: context.rentals.data,
  };
}

function OverviewQueryWarnings({
  queries,
  labels,
}: {
  queries: ReturnType<typeof useOverviewSources>;
  labels: TripOverviewProps['labels'];
}): JSX.Element[] {
  return Object.entries(queries).flatMap(([name, query]) =>
    query.isError
      ? [
          <section key={name} aria-label={labels.status(name)} className="space-y-1">
            <p className="font-medium">
              {labels.status(name)} · {labels.unavailable}
            </p>
            <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
          </section>,
        ]
      : []
  );
}

function OverviewContextLoading({
  context,
  label,
}: {
  context: Omit<ReturnType<typeof useOverviewSources>, 'trip'>;
  label: string;
}): JSX.Element | null {
  return Object.values(context).some((query) => query.isPending) ? (
    <p role="status" className="text-muted-foreground">
      {label}
    </p>
  ) : null;
}

type OverviewContentProps = OverviewViewProps & { coverageComplete: boolean };

function OverviewContent(props: OverviewContentProps): JSX.Element | null {
  const { trip, sources } = props;
  const hasReferences = !!(sources.decisions?.length || sources.documents?.length);
  const readiness = tripReadiness(props.projection, sources, {
    tripId: props.tripId,
    locale: props.locale,
    sourceLabel: props.labels.source,
    coverageComplete: props.coverageComplete,
  });
  return (
    <>
      <OverviewHeader {...props} />
      {props.captureComposer}
      <OverviewSleepPlan {...props} readiness={readiness} />
      {props.sourceControls}
      {props.calendar && <OverviewCalendar {...props} calendar={props.calendar} />}
      <div className="grid min-w-0 gap-6 xl:grid-cols-4">
        <div className="min-w-0 space-y-6 xl:col-span-3">
          <OverviewRoute {...props} />
          <OverviewDetached {...props} />
          {trip.notes && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">{props.labels.notes}</h2>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{trip.notes}</p>
            </section>
          )}
        </div>
        <aside className="min-w-0 space-y-6">
          <OverviewBeforeYouGo {...props} readiness={readiness} />
          {hasReferences && <OverviewReferences {...props} />}
        </aside>
      </div>
    </>
  );
}
