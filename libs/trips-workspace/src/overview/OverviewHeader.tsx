import { Button, PageHeader } from '@pops/ui';

import { resolvedVisit, routeDateRange } from './route-context';

import type { JSX } from 'react';

import type { OverviewViewProps, TripOverviewProps } from './types';

/** Show the selected Trip's recorded name, When text, route bounds and published workspace actions. */
export function OverviewHeader(props: OverviewViewProps): JSX.Element {
  const { trip } = props;
  const title = trip.name?.trim() || trip.destination.trim() || props.labels.trip;
  const bounds = routeDateRange(props.projection, props.locale);
  const destinations = routeDestinations(props);
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
      {(bounds || destinations.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {bounds && <span>{bounds}</span>}
          {bounds && destinations.length > 0 && <span aria-hidden>·</span>}
          {destinations.length > 0 && (
            <ol
              aria-label={props.labels.status('workspace.destinations')}
              className="inline-flex flex-wrap gap-x-2"
            >
              {destinations.map((destination, index) => (
                <li key={destination.key} className="inline-flex items-center gap-2">
                  {index > 0 && <span aria-hidden>·</span>}
                  {destination.name}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

function routeDestinations(props: OverviewViewProps): { key: string; name: string }[] {
  const seen = new Set<number>();
  const destinations = (props.projection?.order ?? []).flatMap((item) => {
    if (
      !resolvedVisit(item) ||
      item.source.tripId !== props.tripId ||
      seen.has(item.source.placeId)
    )
      return [];
    const place = props.sources.places?.find(({ id }) => id === item.source.placeId);
    if (!place?.name.trim()) return [];
    seen.add(place.id);
    return [{ key: `place:${place.id}`, name: place.name.trim() }];
  });
  if (destinations.length > 0 || !props.trip.destination.trim()) return destinations;
  return [{ key: 'trip-destination', name: props.trip.destination.trim() }];
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
