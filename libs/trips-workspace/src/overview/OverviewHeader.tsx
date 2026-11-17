import { Button, PageHeader } from '@pops/ui';

import { routeDateRange } from './route-context';

import type { JSX } from 'react';

import type { TripOverviewProps, OverviewViewProps } from './types';

/** Renders the trip title, date range, and actions for the overview. */
export function OverviewHeader(props: OverviewViewProps): JSX.Element {
  const { trip } = props;
  const title = trip.name?.trim() || trip.destination.trim() || props.labels.trip;
  const bounds = routeDateRange(props.projection, props.locale);
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
