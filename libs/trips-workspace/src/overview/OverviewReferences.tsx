import { EventCard, StayCard } from './ArrangementCards';
import { contextRecords, ContextSources } from './ContextSources';
import { dateLabel, detachedByVisit, detachedRecords } from './model';
import { OverviewDocuments } from './OverviewDocuments';
import { overviewRentals, RentalCard } from './OverviewRentals';
import { renderedVisitReferences } from './route-context';
import { sourceAction } from './source-action';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Unassociated facts and missing visit references remain visible as their own source records. */
export function OverviewDetached(props: OverviewViewProps): JSX.Element | null {
  const visits = renderedVisitReferences(props);
  const stays = detachedRecords(props.sources.stays ?? [], visits);
  const events = detachedRecords(props.sources.events ?? [], visits);
  const contextual = detachedByVisit(
    contextRecords(props.sources, props.tripId),
    visits,
    (record) => record.source.visitId
  );
  const rentals = detachedRecords(overviewRentals(props.sources, props.tripId), visits);
  if (!stays.length && !events.length && !contextual.length && !rentals.length) return null;
  return (
    <section aria-label={props.labels.unassociated} className="space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.unassociated}</h2>
      {stays.map((stay) => (
        <div key={stay.id} className="space-y-1">
          <MissingVisit {...props} id={stay.visitId} />
          <StayCard {...props} stay={stay} />
        </div>
      ))}
      {events.map((event) => (
        <div key={event.id} className="space-y-1">
          <MissingVisit {...props} id={event.visitId} />
          <EventCard {...props} event={event} />
        </div>
      ))}
      {contextual.map((record) => (
        <div key={`${record.kind}:${record.source.id}`} className="space-y-1">
          <MissingVisit {...props} id={record.source.visitId} />
          <ContextSources {...props} records={[record]} />
        </div>
      ))}
      {rentals.map((row) => (
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

/** Decisions and document associations retain independent source identities and contextual opening. */
export function OverviewReferences(props: OverviewViewProps): JSX.Element {
  return (
    <aside className="min-w-0 space-y-6">
      <DecisionReferences {...props} />
      <OverviewDocuments {...props} />
    </aside>
  );
}

function DecisionReferences(props: OverviewViewProps): JSX.Element | null {
  if (!props.sources.decisions?.length) return null;
  return (
    <section aria-label={props.labels.decisions} className="space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.decisions}</h2>
      {props.sources.decisions.map((decision) => (
        <SourceCard
          key={decision.id}
          kind="decision"
          title={decision.question || props.labels.source('decision', decision.id)}
          {...sourceAction(props, { kind: 'decision', id: decision.id })}
          labels={props.labels}
          statuses={[decision.selectedOptionId === null ? 'unresolved' : 'selected']}
        >
          {decision.deadline && (
            <span className="block">{dateLabel(decision.deadline, props.locale)}</span>
          )}
        </SourceCard>
      ))}
    </section>
  );
}
