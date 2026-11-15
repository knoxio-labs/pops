import { Button, cn, ErrorState, PageHeader } from '@pops/ui';

import { projectTripRoute } from '../route/projection';
import { useTripRoute } from '../route/use-trip-route';
import { requestProblem } from '../stay/api';
import { OverviewCalendar } from './OverviewCalendar';
import { OverviewDetached, OverviewReferences } from './OverviewReferences';
import { OverviewRoute } from './OverviewRoute';
import { routeDateRange } from './route-context';
import { useOverviewSources } from './use-overview-sources';
import { WorkspaceCoverage } from './WorkspaceCoverage';

import type { JSX } from 'react';

import type { TripOverviewProps, OverviewViewProps } from './types';
import type { OverviewQueries } from './use-overview-sources';

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
  const sources = {
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
  return (
    <OverviewFrame
      {...props}
      queries={queries}
      trip={trip.data}
      sources={sources}
      accommodationComplete={
        context.visits.isSuccess &&
        !context.visits.isFetching &&
        context.stays.isSuccess &&
        !context.stays.isFetching
      }
      route={route}
      projection={route.view ? projectTripRoute(route.view, sources) : undefined}
    />
  );
}

function OverviewFrame({
  queries,
  ...props
}: OverviewViewProps & { queries: OverviewQueries }): JSX.Element {
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
        <OverviewErrors queries={queries} labels={props.labels} />
        <OverviewContent {...props} />
        {Object.values(queries).some((query) => query.isPending) && (
          <p role="status" className="text-muted-foreground">
            {props.labels.loading}
          </p>
        )}
      </main>
      {props.contextualEditor && (
        <div className="min-w-0 xl:sticky xl:top-6">{props.contextualEditor}</div>
      )}
    </div>
  );
}

function OverviewErrors({
  queries,
  labels,
}: {
  queries: OverviewQueries;
  labels: TripOverviewProps['labels'];
}): JSX.Element {
  return (
    <>
      {Object.entries(queries).map(([name, query]) =>
        query.isError ? (
          <section key={name} aria-label={labels.status(name)} className="space-y-1">
            <p className="font-medium">
              {labels.status(name)} · {labels.unavailable}
            </p>
            <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
          </section>
        ) : null
      )}
    </>
  );
}

function OverviewContent(props: OverviewViewProps): JSX.Element | null {
  const { trip } = props;
  return (
    <>
      <OverviewHeader {...props} />
      <WorkspaceCoverage {...props} />
      {props.captureComposer}
      {props.sourceControls}
      {props.calendar && <OverviewCalendar {...props} calendar={props.calendar} />}
      <div className="min-w-0 space-y-6">
        <div className="min-w-0 space-y-6">
          <OverviewRoute {...props} />
          <OverviewDetached {...props} />
          {trip.notes && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">{props.labels.notes}</h2>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{trip.notes}</p>
            </section>
          )}
        </div>
        <OverviewReferences {...props} />
      </div>
    </>
  );
}

function OverviewHeader(props: OverviewViewProps): JSX.Element {
  const { trip } = props;
  const title = trip.name?.trim() || trip.destination.trim() || props.labels.trip;
  const bounds = routeDateRange(props.projection, props.locale);
  return (
    <>
      <PageHeader
        title={title}
        titleClassName="break-words font-trip-display text-3xl font-semibold tracking-tight sm:text-4xl"
        description={
          trip.when ? (
            <span className="whitespace-pre-wrap break-words">{trip.when}</span>
          ) : undefined
        }
        backHref={props.backHref}
        actions={<OverviewActions {...props} />}
      />
      {bounds && <p className="text-sm text-muted-foreground">{bounds}</p>}
    </>
  );
}

function OverviewActions(props: TripOverviewProps): JSX.Element {
  const legacy =
    props.controls === undefined &&
    props.onOpenSource === undefined &&
    props.calendar === undefined;
  return (
    <div className="flex flex-wrap gap-2">
      {props.controls}
      {legacy && props.calendarLink && (
        <Button asChild variant="outline" className="min-h-11">
          <a href={props.calendarLink.href}>{props.calendarLink.label}</a>
        </Button>
      )}
      {props.documentsHref && (
        <Button asChild variant="outline" className="min-h-11">
          <a href={props.documentsHref}>{props.labels.documents}</a>
        </Button>
      )}
      {legacy && props.settingsHref && (
        <Button asChild variant="outline" className="min-h-11">
          <a href={props.settingsHref}>{props.labels.settings}</a>
        </Button>
      )}
    </div>
  );
}
