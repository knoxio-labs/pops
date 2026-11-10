import { Button, cn, ErrorState, PageHeader } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { dateRange } from './model';
import { OverviewJourneys } from './OverviewJourneys';
import { OverviewDetached, OverviewReferences } from './OverviewReferences';
import { OverviewRoute } from './OverviewRoute';
import { useOverviewSources } from './use-overview-sources';

import type { JSX } from 'react';

import type { TripOverviewProps, OverviewViewProps } from './types';

/** Approved route-first overview, reading each trip-owned source independently through its generated client. */
export function TripOverview(props: TripOverviewProps): JSX.Element | null {
  return (
    <OverviewSession
      key={`${props.client?.getConfig().baseUrl ?? '/trips-api'}:${props.tripId}`}
      {...props}
    />
  );
}

function OverviewSession(props: TripOverviewProps): JSX.Element | null {
  const queries = useOverviewSources(props);
  const { trip, ...context } = queries;
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
  };
  return (
    <main className="w-full min-w-0 space-y-5 text-sm">
      {Object.entries(queries).map(([name, query]) =>
        query.isError ? (
          <section key={name} aria-label={props.labels.status(name)} className="space-y-1">
            <p className="font-medium">
              {props.labels.status(name)} · {props.labels.unavailable}
            </p>
            <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
          </section>
        ) : null
      )}
      <OverviewContent {...props} trip={trip.data} sources={sources} />
      {Object.values(context).some((query) => query.isPending) && (
        <p role="status" className="text-muted-foreground">
          {props.labels.loading}
        </p>
      )}
    </main>
  );
}

function OverviewContent(props: OverviewViewProps): JSX.Element | null {
  const { trip, sources } = props;
  const hasReferences = !!(sources.decisions?.length || sources.documents?.length);
  return (
    <>
      <OverviewHeader {...props} />
      <div className={cn('grid min-w-0 gap-6', hasReferences && 'xl:grid-cols-3')}>
        <div className={cn('min-w-0 space-y-6', hasReferences && 'xl:col-span-2')}>
          <OverviewRoute {...props} />
          <OverviewJourneys {...props} />
          <OverviewDetached {...props} />
          {trip.notes && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">{props.labels.notes}</h2>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{trip.notes}</p>
            </section>
          )}
        </div>
        {hasReferences && <OverviewReferences {...props} />}
      </div>
    </>
  );
}

function OverviewHeader(props: OverviewViewProps): JSX.Element {
  const { trip, sources } = props;
  const title = trip.name?.trim() || trip.destination.trim() || props.labels.trip;
  const bounds = dateRange(
    sources.visits?.[0]?.timing.arrival,
    sources.visits?.at(-1)?.timing.departure,
    props.locale
  );
  return (
    <>
      <PageHeader
        title={<span className="break-words">{title}</span>}
        description={
          trip.when ? (
            <span className="whitespace-pre-wrap break-words">{trip.when}</span>
          ) : undefined
        }
        backHref={props.backHref}
        actions={
          <div className="flex flex-wrap gap-2">
            {props.calendarLink && (
              <Button asChild variant="outline" className="min-h-11">
                <a href={props.calendarLink.href}>{props.calendarLink.label}</a>
              </Button>
            )}
            {props.documentsHref && (
              <Button asChild variant="outline" className="min-h-11">
                <a href={props.documentsHref}>{props.labels.documents}</a>
              </Button>
            )}
            <Button asChild variant="outline" className="min-h-11">
              <a href={props.settingsHref}>{props.labels.settings}</a>
            </Button>
          </div>
        }
      />
      {bounds && <p className="text-sm text-muted-foreground">{bounds}</p>}
    </>
  );
}
