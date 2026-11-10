import { EventCard, StayCard } from './ArrangementCards';
import { contextRecords, ContextSources } from './ContextSources';
import { visitFacts } from './model';
import { overviewRentals, RentalCard } from './OverviewRentals';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** A literal Visit reference is sufficient to retain linked facts even when that Visit is unavailable. */
export function VisitFacts(props: OverviewViewProps & { visitId: number }): JSX.Element {
  const facts = visitFacts(
    props.visitId,
    (props.sources.stays ?? []).filter((stay) => stay.tripId === props.tripId),
    (props.sources.events ?? []).filter((event) => event.tripId === props.tripId)
  );
  return (
    <>
      {facts.stays.map((stay) => (
        <StayCard key={stay.id} {...props} stay={stay} />
      ))}
      {facts.events.map((event) => (
        <EventCard key={event.id} {...props} event={event} />
      ))}
      <ContextSources
        {...props}
        records={contextRecords(props.sources, props.tripId).filter(
          (record) => record.source.visitId === props.visitId
        )}
      />
      {overviewRentals(props.sources, props.tripId)
        .filter((row) => row.visitId === props.visitId)
        .map((row) => (
          <RentalCard key={row.source.id} {...props} row={row} />
        ))}
    </>
  );
}
