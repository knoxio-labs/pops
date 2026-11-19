import { captureTimelineSourceVisible } from '../capture/timeline-filters';
import { contextRecords } from './ContextSources';
import { dateRange, detachedByVisit, detachedRecords } from './model';
import { overviewRentals } from './OverviewRentals';
import { renderedVisitReferences } from './route-context';
import { sourceContactName } from './workspace-people-model';
import { workspaceRecordVisible } from './workspace-projection';

import type { Stay } from '../stay/types';
import type { OverviewContextRecord } from './ContextSources';
import type { OverviewEvent, OverviewViewProps } from './types';

type RentalRow = ReturnType<typeof overviewRentals>[number];

export interface WorkspaceDetachedRecords {
  stays: Stay[];
  events: OverviewEvent[];
  contextual: OverviewContextRecord[];
  rentals: RentalRow[];
}

/** Filter unplaced source records using their explicit search fields and confirmation states. */
export function workspaceDetachedRecords(props: OverviewViewProps): WorkspaceDetachedRecords {
  const visits = renderedVisitReferences(props);
  return {
    stays: detachedStays(props, visits),
    events: detachedEvents(props, visits),
    contextual: detachedContext(props, visits),
    rentals: detachedRentals(props, visits),
  };
}

function detachedStays(
  props: OverviewViewProps,
  visits: ReturnType<typeof renderedVisitReferences>
): Stay[] {
  return detachedRecords(props.sources.stays ?? [], visits).filter((stay) =>
    workspaceRecordVisible(props, {
      text: [
        stay.name,
        stay.kind,
        stay.status,
        stay.address,
        stay.timing.arrival,
        stay.timing.departure,
        dateRange(stay.timing.arrival, stay.timing.departure, props.locale),
        ...stay.hostLinks.flatMap((link) => [link.label, link.uri]),
        sourceContactName(props, { kind: 'stay', id: stay.id }),
        props.labels.source('stay', stay.id),
      ],
      confirmed:
        stay.status === 'Agreed' || stay.status === 'Reserved' || stay.status === 'Purchased',
      needsAttention: missingVisit(stay.visitId, props),
    })
  );
}

function detachedEvents(
  props: OverviewViewProps,
  visits: ReturnType<typeof renderedVisitReferences>
): OverviewEvent[] {
  const events = (props.sources.events ?? []).filter((event) =>
    captureTimelineSourceVisible(props.sourceVisibility, { kind: 'event', id: event.id })
  );
  return detachedRecords(events, visits).filter((event) =>
    workspaceRecordVisible(props, {
      text: [
        event.name,
        event.notes,
        event.address,
        event.reference,
        event.intention,
        event.arrangement,
        event.purchase,
        event.timing.start,
        event.timing.end,
        dateRange(event.timing.start, event.timing.end, props.locale),
        props.labels.source('event', event.id),
        sourceContactName(props, { kind: 'event', id: event.id }),
      ],
      confirmed:
        event.purchase === 'Purchased' ||
        event.arrangement === 'Booked' ||
        event.arrangement === 'Agreed',
      needsAttention: missingVisit(event.visitId, props),
    })
  );
}

function detachedContext(
  props: OverviewViewProps,
  visits: ReturnType<typeof renderedVisitReferences>
): OverviewContextRecord[] {
  const visible = contextRecords(props.sources, props.tripId).filter((record) =>
    captureTimelineSourceVisible(props.sourceVisibility, {
      kind: record.kind,
      id: record.source.id,
    })
  );
  return detachedByVisit(visible, visits, (record) => record.source.visitId).filter((record) =>
    workspaceRecordVisible(props, {
      text: contextSearchText(record, props),
      confirmed: record.kind === 'meeting' && record.source.agreement === 'Agreed',
      needsAttention: missingVisit(record.source.visitId, props),
    })
  );
}

function detachedRentals(
  props: OverviewViewProps,
  visits: ReturnType<typeof renderedVisitReferences>
): RentalRow[] {
  return detachedRecords(overviewRentals(props.sources, props.tripId), visits).filter((row) =>
    workspaceRecordVisible(props, {
      text: [
        row.source.provider,
        row.source.status,
        row.source.start,
        row.source.end,
        dateRange(row.source.start ?? undefined, row.source.end ?? undefined, props.locale),
        props.labels.source('rental', row.source.id),
        sourceContactName(props, { kind: 'rental', id: row.source.id }),
      ],
      confirmed: row.source.status === 'Reserved' || row.source.status === 'Purchased',
      needsAttention: missingVisit(row.source.pickupVisitId, props),
    })
  );
}

function contextSearchText(
  record: OverviewContextRecord,
  props: OverviewViewProps
): (string | null | undefined)[] {
  switch (record.kind) {
    case 'meeting':
      return [
        record.source.title,
        record.source.contactUri,
        sourceContactName(props, { kind: 'meeting', id: record.source.id }),
        record.source.notes,
        record.source.intention,
        record.source.agreement,
        record.source.startDate,
        record.source.endDate,
        dateRange(
          record.source.startDate ?? undefined,
          record.source.endDate ?? undefined,
          props.locale
        ),
        props.labels.source('meeting', record.source.id),
      ];
    case 'capture':
      return [
        record.source.title,
        record.source.originalText,
        record.source.originalUrl,
        record.source.classification,
        record.source.notes,
        props.labels.source('capture', record.source.id),
      ];
    case 'idea':
      return [
        record.source.name,
        record.source.notes,
        record.source.status,
        record.source.timing.mode === 'dates' ? record.source.timing.from : undefined,
        record.source.timing.mode === 'dates' ? record.source.timing.to : undefined,
        props.labels.source('idea', record.source.id),
      ];
  }
}

function missingVisit(visitId: number | null, props: OverviewViewProps): boolean {
  return (
    visitId !== null &&
    props.sources.visits !== undefined &&
    !props.sources.visits.some((visit) => visit.id === visitId && visit.tripId === props.tripId)
  );
}
