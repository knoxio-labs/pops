import { formatTripDate } from '@/fixtures/trip-overview-format';

import { isTripDate } from '../trip-route-editing/lodging-periods';
import { endpointLabel } from './model';

import type { JourneyEndpoint, JourneyLeg, JourneyState } from './model';

/** Show calendar days from explicit local source fields without viewer-zone conversion. */
export function endpointDay(endpoint: JourneyEndpoint): string {
  const day = endpoint.local.slice(0, 10);
  return isTripDate(day) ? formatTripDate(day) : '';
}

/** Numeric durations are calculated elsewhere; unknown values produce no display copy. */
export function durationLabel(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return '';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return [hours ? `${hours}h` : '', rest || !hours ? `${rest}m` : ''].filter(Boolean).join(' ');
}

/** Generate a route title from ordered endpoint references, retaining changed connection locations. */
export function journeyTitle(state: JourneyState): string {
  const labels: string[] = [];
  for (const leg of state.legs) {
    const from = routeEndpoint(state, leg.from);
    if (from && labels.at(-1) !== from) labels.push(from);
    const to = routeEndpoint(state, leg.to);
    if (to && labels.at(-1) !== to) labels.push(to);
  }
  return labels.join(' → ') || 'Journey';
}

/** Describe a leg by its current route position rather than exposing its internal identity. */
export function legLabel(state: JourneyState, leg: JourneyLeg): string {
  const index = state.legs.findIndex((item) => item.id === leg.id);
  return index < 0 ? 'Transport' : `leg ${index + 1}`;
}

function routeEndpoint(state: JourneyState, endpoint: JourneyEndpoint): string {
  const location = state.locations.find((item) => item.id === endpoint.locationId);
  if (location?.code) return location.code;
  return endpointLabel(state, endpoint);
}
