import type { Visit } from '../stay/types';
import type { EventPatch, TripEvent } from './types';

/** Editable source snapshot used for persisted Undo, excluding identity and audit fields. */
export function eventSource(event: TripEvent): EventPatch {
  const {
    visitId,
    name,
    intention,
    arrangement,
    purchase,
    timing,
    address,
    reference,
    sourceUrl,
    ticketUrl,
    notes,
    sourceLinks,
    venueLinks,
    organiserLinks,
    documentLinks,
  } = event;
  return {
    visitId,
    name,
    intention,
    arrangement,
    purchase,
    timing,
    address,
    reference,
    sourceUrl,
    ticketUrl,
    notes,
    sourceLinks,
    venueLinks,
    organiserLinks,
    documentLinks,
  };
}
/** Change one optional timing member without filling any other source fact. */
export function changeEventTiming(
  timing: TripEvent['timing'],
  field: keyof TripEvent['timing'],
  value: string
): TripEvent['timing'] {
  const next = { ...timing };
  if (value === '') delete next[field];
  else next[field] = value;
  return next;
}
/** The associated visit and its immediate neighbours in the producer's persisted order. */
export function eventRoute(event: TripEvent, visits: Visit[]): Visit[] {
  if (event.visitId === null) return [];
  const position = visits.findIndex((visit) => visit.id === event.visitId);
  return position < 0 ? [] : visits.slice(Math.max(0, position - 1), position + 2);
}
