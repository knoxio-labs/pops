import { missingTransportSlot } from '../trip-route-editing/canvas-connections';
import { accommodationPeriods, isTripDate } from '../trip-route-editing/lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

/** Membership follows graph edges, independently of a record's planning intention. */
export function eventVisitPlacement(
  state: CanvasState,
  visitId: string
): 'Working route' | 'Alternative' | 'Outside route' {
  if (state.order.includes(visitId)) return 'Working route';
  if (
    state.sections.some(
      (section) => section.cards.includes(visitId) && state.order.includes(section.gapId)
    )
  )
    return 'Alternative';
  return 'Outside route';
}

function sourceFindings(event: TripRecord, visit?: TripRecord): string[] {
  const findings: string[] = [];
  if (visit && event.placeId && visit.placeId && event.placeId !== visit.placeId)
    findings.push('Event location differs from the associated city.');
  return [...findings, ...dateFindings(event, visit)];
}

function invalidDates(values: (string | undefined)[]): boolean {
  return values.some((value) => value !== undefined && !isTripDate(value));
}

function reversed(start?: string, end?: string): boolean {
  return isTripDate(start) && isTripDate(end) && end < start;
}

function eventBounds(event: TripRecord) {
  return {
    start: event.schedule?.start ?? event.timing?.arrival,
    end: event.schedule?.end ?? event.timing?.departure,
  };
}

function eventDateFindings(event: TripRecord): string[] {
  const { start, end } = eventBounds(event);
  const findings: string[] = [];
  if (invalidDates([start, end])) findings.push('Event contains an invalid date.');
  if (reversed(start, end)) findings.push('Event ends before it starts.');
  return findings;
}

function dateFindings(event: TripRecord, visit?: TripRecord): string[] {
  const findings = eventDateFindings(event);
  const { start, end } = eventBounds(event);
  const arrival = visit?.timing?.arrival;
  const departure = visit?.timing?.departure;
  if (invalidDates([arrival, departure])) findings.push('City contains an invalid date.');
  if (reversed(arrival, departure)) findings.push('City departure is before arrival.');
  if (reversed(arrival, start)) findings.push('Event starts before city arrival.');
  const last = end ?? start;
  if (reversed(last, departure)) findings.push('Event ends after city departure.');
  return findings;
}

function incomingMissingFrom(state: CanvasState, visit?: TripRecord): string | undefined {
  if (!visit) return undefined;
  const index = state.order.indexOf(visit.id);
  if (index < 0) return undefined;
  const previous = state.order
    .slice(0, index)
    .toReversed()
    .map((id) => state.records.find((record) => record.id === id))
    .find((record) => record?.kind === 'city' || record?.kind === 'gap');
  return previous?.kind === 'city' && missingTransportSlot(state, previous.id)
    ? previous.id
    : undefined;
}

/** Project source conflicts, known visit-night gaps and explicit transport endpoints without mutation. */
export function eventRouteImpact(state: CanvasState, event: TripRecord) {
  const visit = state.records.find(
    (record) => record.id === event.visitId && record.kind === 'city'
  );
  const arrival = visit?.timing?.arrival;
  const departure = visit?.timing?.departure;
  const knownNights = isTripDate(arrival) && isTripDate(departure) && arrival < departure;
  const gaps =
    visit && knownNights
      ? accommodationPeriods(visit, state.records).filter(
          (period) =>
            period.missing &&
            period.start &&
            period.end &&
            period.start >= arrival &&
            period.end <= departure
        )
      : [];
  const transport = visit
    ? state.records.filter((record) => {
        const link = state.transitLinks[record.id];
        return record.kind === 'transport' && (link?.from === visit.id || link?.to === visit.id);
      })
    : [];
  return {
    visit,
    placement: visit ? eventVisitPlacement(state, visit.id) : undefined,
    findings: sourceFindings(event, visit),
    gaps,
    transport,
    incomingMissingFrom: incomingMissingFrom(state, visit),
    missingTransport: visit ? missingTransportSlot(state, visit.id) : false,
  };
}
