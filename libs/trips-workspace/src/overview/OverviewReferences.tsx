import { EventCard, StayCard } from './ArrangementCards';
import { dateLabel, detachedRecords } from './model';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { OverviewKind, OverviewViewProps } from './types';

/** Unassociated facts and missing visit references remain visible as their own source records. */
export function OverviewDetached(props: OverviewViewProps): JSX.Element | null {
  const visits = props.sources.visits ?? [];
  const stays = detachedRecords(props.sources.stays ?? [], visits);
  const events = detachedRecords(props.sources.events ?? [], visits);
  if (!stays.length && !events.length) return null;
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

/** Decisions and document associations keep independent authoritative identities and resolution state. */
export function OverviewReferences(props: OverviewViewProps): JSX.Element | null {
  return (
    <aside className="min-w-0 space-y-6">
      {!!props.sources.decisions?.length && (
        <section aria-label={props.labels.decisions} className="space-y-3">
          <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.decisions}</h2>
          {props.sources.decisions.map((decision) => (
            <SourceCard
              key={decision.id}
              kind="decision"
              title={decision.question || props.labels.source('decision', decision.id)}
              href={props.href('decision', decision.id)}
              labels={props.labels}
              statuses={[decision.selectedOptionId === null ? 'unresolved' : 'selected']}
            >
              {decision.deadline && (
                <span className="block">{dateLabel(decision.deadline, props.locale)}</span>
              )}
            </SourceCard>
          ))}
        </section>
      )}
      {!!props.sources.documents?.length && (
        <section aria-label={props.labels.documents} className="space-y-2">
          <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.documents}</h2>
          <ul className="divide-y divide-border">
            {props.sources.documents.map((document) => {
              const href =
                document.targetKind === 'trip'
                  ? undefined
                  : props.href(document.targetKind satisfies OverviewKind, document.targetId);
              return (
                <li key={document.id} className="break-words py-2 text-sm">
                  <p>{props.labels.source('document', document.documentId)}</p>
                  {href ? (
                    <a
                      href={href}
                      className="flex min-h-11 items-center text-xs text-muted-foreground underline"
                    >
                      {props.labels.source(document.targetKind, document.targetId)}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {props.labels.source(document.targetKind, document.targetId)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}
