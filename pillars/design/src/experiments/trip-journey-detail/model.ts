import { instant } from '../trip-route-editing/calendar-time';
import { zonedInstant } from '../trip-route-editing/canvas-zoned-time';

import type {
  JourneyEndpoint,
  JourneyLeg,
  JourneyState,
  JourneyFinding,
  JourneyContextItem,
} from './fixture';

/** Public source contracts shared with the fictional fixtures. */
export type {
  JourneyEndpoint,
  JourneyLeg,
  JourneyLocation,
  JourneyDocument,
  JourneyContextItem,
  JourneyState,
  JourneyFinding,
  JourneyScenario,
} from './fixture';
export { transportModes } from './fixture';

/** Resolves catalogue labels without inventing missing location metadata. */
export function endpointLabel(state: JourneyState, endpoint: JourneyEndpoint): string {
  if (!endpoint.locationId) return '';
  const location = state.locations.find((item) => item.id === endpoint.locationId);
  if (!location) return 'Location unavailable';
  return location.code ? `${location.name} (${location.code})` : location.name;
}
/** Resolves only unambiguous, valid local clocks in an explicit zone. */
export function endpointInstant(endpoint: JourneyEndpoint): number | undefined {
  if (!endpoint.timeZone) return undefined;
  const resolved = zonedInstant(endpoint.local, endpoint.timeZone);
  return resolved === undefined ? undefined : instant(resolved);
}
function elapsed(from: JourneyEndpoint, to: JourneyEndpoint): number | undefined {
  const [start, end] = [from, to].map(endpointInstant);
  return start === undefined || end === undefined ? undefined : (end - start) / 60_000;
}
/** Returns actual elapsed minutes; unknown or reversed endpoints have no duration. */
export function legMinutes(leg: JourneyLeg): number | undefined {
  const minutes = elapsed(leg.from, leg.to);
  return minutes === undefined || minutes < 0 ? undefined : minutes;
}
/** Returns the signed actual interval, including negative overlaps; never estimates a transfer. */
export function connectionMinutes(previous: JourneyLeg, next: JourneyLeg): number | undefined {
  return elapsed(previous.to, next.from);
}
function finding(
  id: string,
  kind: JourneyFinding['kind'],
  title: string,
  legIds: string[]
): JourneyFinding {
  return { id, kind, title, detail: title, legIds };
}
function legFindings(state: JourneyState, leg: JourneyLeg): JourneyFinding[] {
  const results: JourneyFinding[] = [];
  const endpoints = [leg.from, leg.to];
  if (
    endpoints.some(
      (end) => end.locationId && !state.locations.some((location) => location.id === end.locationId)
    )
  )
    results.push(finding(`${leg.id}-location`, 'gap', 'Location unavailable', [leg.id]));
  if (endpoints.some((end) => end.local && end.timeZone && endpointInstant(end) === undefined))
    results.push(
      finding(`${leg.id}-clock`, 'conflict', 'Time or zone is invalid or ambiguous', [leg.id])
    );
  if ((elapsed(leg.from, leg.to) ?? 0) < 0)
    results.push(finding(`${leg.id}-reversed`, 'conflict', 'Arrival precedes departure', [leg.id]));
  return results;
}
function connectionFindings(
  state: JourneyState,
  previous: JourneyLeg,
  next: JourneyLeg
): JourneyFinding[] {
  const ids = [previous.id, next.id];
  const id = `${previous.id}-${next.id}`;
  const results: JourneyFinding[] = [];
  const different = previous.to.locationId !== next.from.locationId;
  if (different && previous.to.locationId && next.from.locationId)
    results.push(finding(`${id}-transfer`, 'gap', 'Different locations; transfer missing', ids));
  const minutes = connectionMinutes(previous, next);
  if (minutes === undefined) return results;
  if (minutes < 0)
    results.push(finding(`${id}-overlap`, 'conflict', 'Departure precedes previous arrival', ids));
  else if (!different && previous.to.locationId && minutes < state.minimumConnectionMinutes)
    results.push(
      finding(
        `${id}-buffer`,
        'conflict',
        `${minutes} min connection is below your ${state.minimumConnectionMinutes} min minimum`,
        ids
      )
    );
  return results;
}
function contextFindings(state: JourneyState): JourneyFinding[] {
  const first = state.legs.find((leg) => leg.mode === 'flight');
  if (!first) return [];
  return state.context.flatMap((item) => {
    const available = elapsed(item.end, first.from);
    if ((elapsed(item.start, item.end) ?? -1) < 0) return [];
    const startsBefore = (elapsed(item.start, first.from) ?? -1) >= 0;
    return item.kind === 'event' &&
      startsBefore &&
      available !== undefined &&
      available < state.airportBufferMinutes
      ? [
          finding(
            `${item.id}-airport`,
            'conflict',
            available < 0
              ? `${item.title} overlaps departure by ${-available} min`
              : `${item.title} · ${available} min before departure · ${state.airportBufferMinutes} min buffer`,
            [first.id]
          ),
        ]
      : [];
  });
}
function arrivalFindings(state: JourneyState): JourneyFinding[] {
  const last = state.legs.at(-1);
  if (!last || endpointInstant(last.to) === undefined) return [];
  return state.context.flatMap((item) => {
    const untilEnd = elapsed(last.to, item.end);
    if (
      item.kind !== 'stay' ||
      untilEnd === undefined ||
      untilEnd <= 0 ||
      (elapsed(item.start, item.end) ?? -1) < 0 ||
      !item.start.locationId ||
      item.start.locationId === last.to.locationId
    )
      return [];
    const recorded = state.context.some(
      (transfer) =>
        transfer.kind === 'transfer' &&
        transfer.start.locationId === last.to.locationId &&
        transfer.end.locationId === item.start.locationId &&
        (elapsed(last.to, transfer.start) ?? -1) >= 0 &&
        (elapsed(transfer.end, item.end) ?? -1) > 0 &&
        (elapsed(transfer.start, transfer.end) ?? -1) >= 0
    );
    return recorded
      ? []
      : [
          finding(
            `${item.id}-transfer`,
            'gap',
            `Transfer to ${item.title} is not recorded; travel time is unknown`,
            [last.id]
          ),
        ];
  });
}
/** Derives findings from source facts and configured buffers without changing purchase status. */
export function journeyFindings(state: JourneyState): JourneyFinding[] {
  const results = state.legs.flatMap((leg, index) => {
    const previous = state.legs[index - 1];
    const connections = previous ? connectionFindings(state, previous, leg) : [];
    return [...legFindings(state, leg), ...connections];
  });
  return [...results, ...contextFindings(state), ...arrivalFindings(state)];
}
/** Appends explicit blanks; no location, clock or zone is silently selected. */
export function addLeg(state: JourneyState, mode: JourneyLeg['mode']): JourneyState {
  const blank = (): JourneyEndpoint => ({ locationId: '', local: '', timeZone: '' });
  const leg: JourneyLeg = {
    id: crypto.randomUUID(),
    mode,
    from: blank(),
    to: blank(),
    status: 'Considering',
    reference: '',
    operator: '',
    service: '',
  };
  return { ...state, legs: [...state.legs, leg] };
}
/** Replaces an existing source leg without modifying ordering or booking facts. */
export function updateLeg(state: JourneyState, leg: JourneyLeg): JourneyState {
  return { ...state, legs: state.legs.map((current) => (current.id === leg.id ? leg : current)) };
}
/** Removes only the selected segment, preserving purchase and attachment facts. */
export function removeLeg(state: JourneyState, id: string): JourneyState {
  return { ...state, legs: state.legs.filter((leg) => leg.id !== id) };
}
function dayBoundary(endpoint: JourneyEndpoint, dayOffset: number): number | undefined {
  if (endpointInstant(endpoint) === undefined) return undefined;
  const date = new Date(`${endpoint.local.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return endpointInstant({ ...endpoint, local: `${date.toISOString().slice(0, 10)}T00:00` });
}
/** Includes overlapping context from the local day before departure through the local day after arrival. */
export function journeyWindow(state: JourneyState): JourneyContextItem[] {
  const first = state.legs[0];
  const last = state.legs.at(-1);
  if (!first || !last) return [];
  const start = dayBoundary(first.from, -1);
  const end = dayBoundary(last.to, 2);
  if (start === undefined || end === undefined || end <= start) return [];
  return state.context.filter((item) => {
    const from = endpointInstant(item.start);
    const to = endpointInstant(item.end);
    return from !== undefined && to !== undefined && to >= from && from < end && to >= start;
  });
}
