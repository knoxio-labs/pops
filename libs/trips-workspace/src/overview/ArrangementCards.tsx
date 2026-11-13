import { dateRange } from './model';
import { sourceAction } from './source-action';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { Stay } from '../stay/types';
import type { OverviewEvent, OverviewViewProps } from './types';

/** Source accommodation keeps its own timing and status, independent of its containing visit. */
export function StayCard({
  stay,
  ...props
}: OverviewViewProps & { stay: Stay }): JSX.Element | null {
  const timing = stay.timing;
  return (
    <SourceCard
      kind="stay"
      title={stay.name ?? props.labels.source('stay', stay.id)}
      {...sourceAction(props, { kind: 'stay', id: stay.id })}
      purchased={stay.status === 'Purchased'}
      statuses={[stay.status]}
      labels={props.labels}
      when={dateRange(timing.arrival, timing.departure, props.locale)}
      withWhom={
        stay.hostLinks.length
          ? `${props.labels.status('workspace.host')} · ${stay.hostLinks.map((link) => link.label ?? link.uri).join(' · ')}`
          : undefined
      }
      documents={props.sources.documents?.filter(
        (document) =>
          document.tripId === props.tripId &&
          document.targetKind === 'stay' &&
          document.targetId === stay.id
      )}
    >
      {(timing.checkIn || timing.checkOut || timing.timeZone) && (
        <span className="block">
          {[timing.checkIn, timing.checkOut, timing.timeZone].filter(Boolean).join(' · ')}
        </span>
      )}
      {stay.kind && <span className="block">{props.labels.status(stay.kind)}</span>}
      {stay.address && <span className="block whitespace-pre-wrap">{stay.address}</span>}
    </SourceCard>
  );
}
/** Wanted and alternative events remain visible; purchase and booking never follow intention. */
export function EventCard({
  event,
  ...props
}: OverviewViewProps & { event: OverviewEvent }): JSX.Element | null {
  const timing = event.timing;
  return (
    <SourceCard
      kind="event"
      title={event.name ?? props.labels.source('event', event.id)}
      {...sourceAction(props, { kind: 'event', id: event.id })}
      purchased={event.purchase === 'Purchased'}
      statuses={[event.intention, event.arrangement, event.purchase]}
      labels={props.labels}
      when={dateRange(timing.start, timing.end, props.locale)}
      withWhom={
        event.organiserLinks.length
          ? `${props.labels.status('workspace.organiser')} · ${event.organiserLinks.map((link) => link.label ?? link.uri).join(' · ')}`
          : undefined
      }
      documents={props.sources.documents?.filter(
        (document) =>
          document.tripId === props.tripId &&
          document.targetKind === 'event' &&
          document.targetId === event.id
      )}
    >
      {(timing.startTime || timing.endTime || timing.timeZone) && (
        <span className="block">
          {[timing.startTime, timing.endTime, timing.timeZone].filter(Boolean).join(' · ')}
        </span>
      )}
      {event.address && <span className="block whitespace-pre-wrap">{event.address}</span>}
    </SourceCard>
  );
}
