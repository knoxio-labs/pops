import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from './canvas-model';

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function bounds(record: TripRecord, records: TripRecord[]) {
  const dates = records
    .filter((r) => r.visitId === record.id && r.kind !== 'transport')
    .flatMap((r) => (r.schedule ? [r.schedule.start, r.schedule.end ?? r.schedule.start] : []))
    .filter(validDate)
    .toSorted();
  return {
    start: record.timing?.arrival ?? dates[0],
    end: record.timing?.departure ?? dates.at(-1),
  };
}

function rangeIssues(range: { start?: string; end?: string }): string[] {
  if ([range.start, range.end].some((date) => date !== undefined && !validDate(date)))
    return ['Invalid visit date'];
  if (range.start && range.end && range.start > range.end) return ['Arrival is after departure'];
  return [];
}

function addIssue(issues: Record<string, string[]>, id: string, message: string): void {
  issues[id] = [...(issues[id] ?? []), message];
}

/** Date-order conflicts use preview order and known bounds without hardening wanted commitments. */
export function routeIssues(state: CanvasState): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  let previous: { id: string; end: string } | undefined;
  for (const id of state.order) {
    const record = state.records.find((r) => r.id === id);
    if (record?.kind !== 'city') continue;
    const range = bounds(record, state.records);
    const ownIssues = rangeIssues(range);
    if (ownIssues.length > 0) issues[id] = ownIssues;
    if (previous && range.start && validDate(range.start) && range.start < previous.end) {
      const message = `${range.start} < ${previous.end}`;
      addIssue(issues, id, message);
      addIssue(issues, previous.id, message);
    }
    if (range.end && validDate(range.end)) previous = { id, end: range.end };
  }
  return issues;
}

function neighbours(state: CanvasState, id: string) {
  const index = state.order.indexOf(id);
  if (index < 0) return {};
  const cities = (ids: string[]) =>
    ids.map((key) => state.records.find((r) => r.id === key)).find((r) => r?.kind === 'city');
  return {
    before: cities(state.order.slice(0, index).toReversed()),
    after: cities(state.order.slice(index + 1)),
  };
}

function mismatch(actual?: string, expected?: string): string[] {
  return actual && expected && actual !== expected ? [`${actual} ≠ ${expected}`] : [];
}

function transportDateIssues(
  record: TripRecord,
  before?: TripRecord,
  after?: TripRecord
): string[] {
  const departure = record.schedule?.start;
  const arrival = record.schedule?.end ?? departure;
  const issues =
    record.schedule && rangeIssues({ start: departure, end: arrival }).length > 0
      ? ['Invalid transport date range']
      : [];
  return [
    ...issues,
    ...mismatch(departure, before?.timing?.departure),
    ...mismatch(arrival, after?.timing?.arrival),
  ];
}

/** Inspect a fixed transport's explicit endpoints and dates independently of its display position. */
export function transportIssues(state: CanvasState, record: TripRecord): string[] {
  const link = state.transitLinks[record.id];
  if (!link) return ['Transport endpoints are missing'];
  const { before, after } = neighbours(state, record.id);
  const issues =
    before?.id === link.from && after?.id === link.to
      ? []
      : ['Transport does not connect these visits'];
  return [...issues, ...transportDateIssues(record, before, after)];
}

function journeyPlaced(state: CanvasState, id: string, from: string, to: string): boolean {
  const { before, after } = neighbours(state, id);
  return before?.id === from && after?.id === to;
}

function arrangedJourney(state: CanvasState, from: string, to: string): boolean {
  return Object.entries(state.transitLinks).some(
    ([id, link]) =>
      link.from === from &&
      link.to === to &&
      journeyPlaced(state, id, from, to) &&
      state.records.some(
        (r) =>
          r.id === id &&
          r.kind === 'transport' &&
          (r.arrangement === 'Booked' || r.arrangement === 'Agreed')
      )
  );
}

function journeyDates(state: CanvasState, fromIndex: number, toIndex: number): string[] {
  return state.order
    .slice(fromIndex, toIndex + 1)
    .flatMap((id, index) => {
      const record = state.records.find((item) => item.id === id);
      if (record?.kind !== 'city') return [];
      if (index === 0) return [record.timing?.departure];
      if (index === toIndex - fromIndex) return [record.timing?.arrival];
      return [record.timing?.arrival, record.timing?.departure];
    })
    .filter((date) => date !== undefined);
}

function rentalCoverage(state: CanvasState, fromIndex: number, toIndex: number): boolean {
  const dates = journeyDates(state, fromIndex, toIndex);
  return state.rentals.some((rental) => {
    const start = state.order.indexOf(rental.from);
    const end = state.order.indexOf(rental.to);
    return (
      rental.status !== 'Considering' &&
      rangeIssues({ start: rental.start, end: rental.end }).length === 0 &&
      start >= 0 &&
      end > start &&
      start <= fromIndex &&
      end >= toIndex &&
      dates.every((date) => validDate(date) && date >= rental.start && date <= rental.end)
    );
  });
}

/** Forward edges accept placed arranged journeys or hires covering all known travel dates; unknown dates use order. */
export function transportMissing(state: CanvasState, from: string, to: string): boolean {
  const a = state.records.find((r) => r.id === from);
  const b = state.records.find((r) => r.id === to);
  if (!a || !b) return true;
  if (a.placeId === b.placeId) return false;
  const x = state.order.indexOf(from);
  const y = state.order.indexOf(to);
  if (x < 0 || y <= x) return true;
  return !arrangedJourney(state, from, to) && !rentalCoverage(state, x, y);
}
