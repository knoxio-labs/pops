import { dateRange } from './model';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { Stay } from '../stay/types';
import type { OverviewEvent, TripOverviewProps } from './types';

/** Source accommodation keeps its own timing and status, independent of its containing visit. */
export function StayCard({
  stay,
  ...props
}: TripOverviewProps & { stay: Stay }): JSX.Element | null {
  const timing = stay.timing;
  return (
    <SourceCard
      kind="stay"
      title={stay.name ?? props.labels.source('stay', stay.id)}
      href={props.href('stay', stay.id)}
      purchased={stay.status === 'Purchased'}
      statuses={[stay.status]}
      labels={props.labels}
    >
      {dateRange(timing.arrival, timing.departure, props.locale) && (
        <span className="block">{dateRange(timing.arrival, timing.departure, props.locale)}</span>
      )}
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
}: TripOverviewProps & { event: OverviewEvent }): JSX.Element | null {
  const timing = event.timing;
  return (
    <SourceCard
      kind="event"
      title={event.name ?? props.labels.source('event', event.id)}
      href={props.href('event', event.id)}
      purchased={event.purchase === 'Purchased'}
      statuses={[event.intention, event.arrangement, event.purchase]}
      labels={props.labels}
    >
      {dateRange(timing.start, timing.end, props.locale) && (
        <span className="block">{dateRange(timing.start, timing.end, props.locale)}</span>
      )}
      {(timing.startTime || timing.endTime || timing.timeZone) && (
        <span className="block">
          {[timing.startTime, timing.endTime, timing.timeZone].filter(Boolean).join(' · ')}
        </span>
      )}
      {event.address && <span className="block whitespace-pre-wrap">{event.address}</span>}
    </SourceCard>
  );
}
