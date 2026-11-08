import { instant } from '../trip-route-editing/calendar-time';
import { zonedInstant } from '../trip-route-editing/canvas-zoned-time';
import { isTripDate } from '../trip-route-editing/lodging-periods';

/** Editable fictional stay facts. Dates are calendar dates; checkout is exclusive; clocks are optional HH:mm. */
export interface StayState {
  name: string;
  kind: 'hotel' | 'friend' | 'family' | 'other';
  status: 'Considering' | 'Agreed' | 'Reserved' | 'Purchased';
  visit: { id: string; name: string; from: string; to: string };
  from: string;
  to: string;
  checkIn: string;
  checkOut: string;
  timeZone: string;
  address: string;
  hostId: string;
  hosts: { id: string; name: string; method: string }[];
  reference: string;
  notes: string;
  documentIds: string[];
  documents: { id: string; name: string }[];
  adjacent: { id: string; name: string; from: string; to: string }[];
  activities: { id: string; title: string; local: string }[];
}

/** A source-derived conflict or actionable gap; never changes arrangement or purchase facts. */
export interface StayFinding {
  id: string;
  kind: 'conflict' | 'gap';
  title: string;
  detail: string;
}

export { initialStay } from './fixture';
export type { StayScenario } from './fixture';

type Interval = { from: string; to: string };

function validInterval(value: Interval): boolean {
  return isTripDate(value.from) && isTripDate(value.to) && value.to > value.from;
}

function days(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** Counts calendar nights, independent of DST; incomplete, impossible and non-positive ranges remain unknown. */
export function stayNights(state: StayState): number | undefined {
  return validInterval(state) ? days(state.from, state.to) : undefined;
}

function finding(
  id: string,
  kind: StayFinding['kind'],
  title: string,
  detail: string
): StayFinding {
  return { id, kind, title, detail };
}

function dateFindings(state: StayState): StayFinding[] {
  const invalid = [state.from, state.to].some((date) => date && !isTripDate(date));
  if (invalid)
    return [finding('dates-invalid', 'conflict', 'Correct stay dates', 'Use real calendar dates.')];
  if (state.from && state.to && state.to <= state.from)
    return [
      finding(
        'dates-reversed',
        'conflict',
        'Checkout must follow check-in',
        'Choose a checkout date after the first night.'
      ),
    ];
  const { visit } = state;
  const before = isTripDate(state.from) && isTripDate(visit.from) && state.from < visit.from;
  const after = isTripDate(state.to) && isTripDate(visit.to) && state.to > visit.to;
  return before || after
    ? [
        finding(
          'outside-visit',
          'conflict',
          'Stay extends beyond visit',
          `Adjust stay dates or the ${visit.name} visit dates.`
        ),
      ]
    : [];
}

function clockFindings(state: StayState): StayFinding[] {
  const pairs = [
    [state.from, state.checkIn],
    [state.to, state.checkOut],
  ];
  if (pairs.some(([, clock]) => clock && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock ?? '')))
    return [
      finding(
        'clock-invalid',
        'conflict',
        'Correct check-in or checkout time',
        'Use a valid HH:mm clock.'
      ),
    ];
  if (!state.timeZone) return [];
  const resolved = pairs.map(([date, clock]) =>
    date && clock && isTripDate(date) ? zonedInstant(`${date}T${clock}`, state.timeZone) : undefined
  );
  if (
    pairs.some(
      ([date, clock], index) => date && clock && isTripDate(date) && resolved[index] === undefined
    )
  )
    return [
      finding(
        'clock-zone',
        'conflict',
        'Check time and zone',
        'A local time is invalid, skipped or ambiguous in the selected zone.'
      ),
    ];
  const [from, to] = resolved;
  return from && to && instant(to) <= instant(from)
    ? [
        finding(
          'clock-reversed',
          'conflict',
          'Checkout time must follow check-in',
          'The recorded clocks do not form a positive stay interval.'
        ),
      ]
    : [];
}

function coverageGap(id: string, from: string, to: string): StayFinding {
  return finding(
    id,
    'gap',
    'Accommodation gap',
    `${days(from, to)} nights between ${from} and ${to} have no recorded stay.`
  );
}

function coverageFindings(state: StayState): StayFinding[] {
  if (!validInterval(state) || !validInterval(state.visit)) return [];
  const { visit } = state;
  const ranges = [state, ...state.adjacent].filter(validInterval);
  const inside = ranges
    .map((range) => ({
      from: range.from < visit.from ? visit.from : range.from,
      to: range.to > visit.to ? visit.to : range.to,
    }))
    .filter((range) => range.to > range.from)
    .toSorted((left, right) => left.from.localeCompare(right.from));
  const results: StayFinding[] = [];
  let covered = visit.from;
  const complete = state.adjacent.every(validInterval);
  for (const [index, range] of inside.entries()) {
    if (range.from < covered)
      results.push(
        finding(
          `overlap-${index}`,
          'conflict',
          'Stays overlap',
          `${range.from}–${range.to} overlaps another stay within ${visit.name}.`
        )
      );
    if (complete && range.from > covered)
      results.push(coverageGap(`gap-${index}`, covered, range.from));
    if (range.to > covered) covered = range.to;
  }
  if (complete && covered < visit.to) results.push(coverageGap('gap-end', covered, visit.to));
  return results;
}

function referenceFindings(state: StayState): StayFinding[] {
  const results: StayFinding[] = [];
  if (state.hostId && !state.hosts.some((host) => host.id === state.hostId))
    results.push(
      finding(
        'host-missing',
        'gap',
        'Reconnect host',
        'The original contact is unavailable. Select a replacement or remove the link.'
      )
    );
  for (const id of state.documentIds) {
    if (!state.documents.some((document) => document.id === id))
      results.push(
        finding(
          `document-${id}`,
          'gap',
          'Reconnect document',
          'The original document is unavailable. Select a replacement or remove the link.'
        )
      );
  }
  return results;
}

/** Derives date, clock, visit coverage and broken-reference findings without mutating source facts. */
export function stayFindings(state: StayState): StayFinding[] {
  return [
    ...dateFindings(state),
    ...clockFindings(state),
    ...coverageFindings(state),
    ...referenceFindings(state),
  ];
}
