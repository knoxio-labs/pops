import { normalizeSearchText } from '../../fixtures/search-text';
import { isTripDate } from '../trip-route-editing/lodging-periods';
import {
  settingsFindings,
  settingsTitle,
  type SettingsState,
  type TripSettings,
} from '../trip-settings/model';

import type { RouteTiming } from '../trip-settings/timing-model';

/** A source trip with independent ordered route timing and its actual modification timestamp. */
export interface HomeTrip {
  settings: TripSettings;
  route: RouteTiming[];
  updatedAt: string;
}

/** Local trip catalogue and explicit review date; timing groups are derived rather than persisted status. */
export interface HomeState {
  trips: HomeTrip[];
  tags: { id: string; name: string }[];
  referenceDate: string;
}

/** Named fictional review scenarios for the trip catalogue. */
export type HomeScenario =
  | 'default'
  | 'empty'
  | 'open-dates'
  | 'missing-parent'
  | 'conflicting-dates';

/** A derived calendar relation; other includes unknown and contradictory boundaries. */
export type HomeBucket = 'current' | 'upcoming' | 'other' | 'past';

function timestamp(value: string): number {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !isTripDate(value.slice(0, 10))
  )
    return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function routeBounds(route: RouteTiming[]) {
  const firstStart = route[0]?.start;
  const lastEnd = route.at(-1)?.end;
  return {
    start: isTripDate(firstStart) ? firstStart : '',
    end: isTripDate(lastEnd) ? lastEnd : '',
  };
}

/** Uses only first.start and last.end; unknown bounds and free timing text never imply an ongoing trip. */
export function homeBucket(trip: HomeTrip, referenceDate: string): HomeBucket {
  if (!isTripDate(referenceDate)) return 'other';
  const { start, end } = routeBounds(trip.route);
  if (start && end) {
    if (start > end) return 'other';
    if (start <= referenceDate && referenceDate <= end) return 'current';
  }
  if (start && start > referenceDate) return 'upcoming';
  if (end && end < referenceDate) return 'past';
  return 'other';
}

/** Resolves only the selected parent source; an unset parent is omitted and missing sources remain explicit. */
export function homeParentLabel(state: HomeState, trip: HomeTrip): string {
  if (!trip.settings.parentId) return '';
  const parent = state.trips.find((item) => item.settings.id === trip.settings.parentId);
  return parent ? settingsTitle(parent.settings) : 'Parent unavailable';
}

/** Searches explicit trip and parent facts, then orders by valid modification timestamps newest first. */
export function homeTrips(state: HomeState, query: string, bucket: 'all' | HomeBucket): HomeTrip[] {
  const needle = normalizeSearchText(query.trim());
  return state.trips
    .filter((trip) => {
      if (bucket !== 'all' && homeBucket(trip, state.referenceDate) !== bucket) return false;
      const parent = state.trips.find((item) => item.settings.id === trip.settings.parentId);
      return [
        settingsTitle(trip.settings),
        trip.settings.destination,
        trip.settings.when,
        ...trip.route.map((record) => record.title),
        parent ? settingsTitle(parent.settings) : '',
      ].some((value) => normalizeSearchText(value).includes(needle));
    })
    .toSorted((left, right) => {
      const leftTime = timestamp(left.updatedAt);
      const rightTime = timestamp(right.updatedAt);
      if (leftTime === rightTime) return 0;
      return leftTime > rightTime ? -1 : 1;
    });
}

/** Builds independent settings drafts against the current trip and tag catalogues without inventing references. */
export function homeSettingsState(
  state: HomeState,
  trip: TripSettings,
  route: RouteTiming[] = []
): SettingsState {
  return {
    trip: { ...trip },
    trips: state.trips.map((item) => ({
      id: item.settings.id,
      name: settingsTitle(item.settings),
      parentId: item.settings.parentId,
    })),
    tags: state.tags.map((tag) => ({ ...tag })),
    route: route.map((record) => ({ ...record })),
    saved: null,
  };
}

/** Appends a valid explicitly identified settings snapshot with an empty route, without parsing planning text. */
export function addHomeTrip(
  state: HomeState,
  settings: TripSettings,
  newUpdatedAt: string
): HomeState {
  if (
    !settings.id.trim() ||
    state.trips.some((trip) => trip.settings.id === settings.id) ||
    !Number.isFinite(timestamp(newUpdatedAt)) ||
    settingsFindings(homeSettingsState(state, settings)).length
  )
    return state;
  return {
    ...state,
    trips: [...state.trips, { settings: { ...settings }, route: [], updatedAt: newUpdatedAt }],
  };
}
