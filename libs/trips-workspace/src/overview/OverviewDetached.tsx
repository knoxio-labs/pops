import { EventCard, StayCard } from './ArrangementCards';
import { ContextSources } from './ContextSources';
import { RentalCard } from './OverviewRentals';
import { workspaceDetachedRecords } from './workspace-detached-records';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Unassociated facts and missing visit references remain visible as their own source records. */
export function OverviewDetached(props: OverviewViewProps): JSX.Element | null {
  const records = workspaceDetachedRecords(props);
  if (
    !records.stays.length &&
    !records.events.length &&
    !records.contextual.length &&
    !records.rentals.length
  )
    return null;
  return (
    <section aria-label={props.labels.unassociated} className="space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.unassociated}</h2>
      {records.stays.map((stay) => (
        <div key={stay.id} className="space-y-1">
          <MissingVisit {...props} id={stay.visitId} />
          <StayCard {...props} stay={stay} />
        </div>
      ))}
      {records.events.map((event) => (
        <div key={event.id} className="space-y-1">
          <MissingVisit {...props} id={event.visitId} />
          <EventCard {...props} event={event} />
        </div>
      ))}
      {records.contextual.map((record) => (
        <div key={`${record.kind}:${record.source.id}`} className="space-y-1">
          <MissingVisit {...props} id={record.source.visitId} />
          <ContextSources {...props} records={[record]} />
        </div>
      ))}
      {records.rentals.map((row) => (
        <div key={row.source.id} className="space-y-1">
          <MissingVisit {...props} id={row.visitId} />
          <RentalCard {...props} row={row} />
        </div>
      ))}
    </section>
  );
}

function MissingVisit(props: OverviewViewProps & { id: number | null }): JSX.Element | null {
  return props.id !== null ? (
    <p className="text-xs text-muted-foreground">
      {props.labels.source('visit', props.id)}
      {props.sources.visits !== undefined && ` · ${props.labels.unavailable}`}
    </p>
  ) : null;
}
