import { MapPin } from 'lucide-react';

import { Button } from '@pops/ui';

import { EventCard, StayCard } from './ArrangementCards';
import { visitRecords, visitTiming } from './model';

import type { JSX } from 'react';

import type { VisitRecord } from './model';
import type { OverviewViewProps } from './types';

/** Ordered visit occurrences use a date rail; only exact stay/event visit associations appear inside. */
export function OverviewRoute(props: OverviewViewProps): JSX.Element | null {
  const { visits, stays, events } = props.sources;
  const records = visitRecords(visits ?? [], stays ?? [], events ?? []);
  return (
    <section aria-label={props.labels.route} className="min-w-0 space-y-4">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.route}</h2>
      {visits?.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {props.labels.empty}
        </p>
      )}
      <ol>
        {records.map((record) => (
          <RouteVisit key={record.visit.id} {...props} record={record} />
        ))}
      </ol>
    </section>
  );
}

function RouteVisit({
  record: { visit, stays: visitStays, events: visitEvents },
  ...props
}: OverviewViewProps & { record: VisitRecord }): JSX.Element {
  const title =
    props.sources.places?.find((place) => place.id === visit.placeId)?.name ??
    props.labels.source('place', visit.placeId);
  const href = props.href('visit', visit.id);
  return (
    <li
      data-visit-id={visit.id}
      className="grid min-w-0 grid-cols-1 gap-2 pb-5 sm:grid-cols-4 sm:gap-4"
    >
      <p className="min-w-0 break-words pl-10 text-xs font-medium text-muted-foreground sm:pl-0 sm:pt-3 sm:text-right">
        {visitTiming(visit, props.locale, props.labels.status)}
      </p>
      <div className="relative min-w-0 border-l border-dotted border-border pl-5 sm:col-span-3">
        <span className="absolute -left-4 top-2 flex size-8 items-center justify-center rounded-full border border-border bg-background">
          <MapPin className="size-4 text-app-accent" aria-hidden />
        </span>
        <div className="min-w-0 space-y-3 rounded-lg border border-dashed border-border p-3">
          <h3 className="break-words text-lg font-semibold">
            {href ? (
              <Button
                asChild
                variant="ghost"
                className="h-auto min-h-11 w-full justify-start whitespace-normal px-0 text-left text-lg"
              >
                <a href={href}>{title}</a>
              </Button>
            ) : (
              title
            )}
          </h3>
          {visit.notes && (
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {visit.notes}
            </p>
          )}
          {visitStays.map((stay) => (
            <StayCard key={stay.id} {...props} stay={stay} />
          ))}
          {visitEvents.map((event) => (
            <EventCard key={event.id} {...props} event={event} />
          ))}
        </div>
      </div>
    </li>
  );
}
