import { isTripDate } from '../trip-route-editing/lodging-periods';

/** Editable fictional trip settings; empty strings represent unknown optional values. */
export interface TripSettings {
  id: string;
  name: string;
  destination: string;
  start: string;
  end: string;
  tagId: string;
  parentId: string;
  notes: string;
}

/** Draft and saved settings with independently owned reference catalogues. */
export interface SettingsState {
  trip: TripSettings;
  trips: { id: string; name: string; parentId: string }[];
  tags: { id: string; name: string }[];
  saved: TripSettings | null;
}

/** An invalid captured value or unavailable selected reference that prevents saving. */
export interface SettingsFinding {
  id: string;
  message: string;
}

/** Use a custom name, otherwise the destination and valid start year; never borrow other dates. */
export function settingsTitle(trip: TripSettings): string {
  if (trip.name.trim()) return trip.name.trim();
  const destination = trip.destination.trim();
  if (!destination) return 'Trip';
  return isTripDate(trip.start) ? `${destination} · ${trip.start.slice(0, 4)}` : destination;
}

function descendantIds(state: SettingsState): Set<string> {
  const excluded = new Set([state.trip.id]);
  const pending = [state.trip.id];
  while (pending.length) {
    const parentId = pending.pop();
    for (const trip of state.trips) {
      if (trip.parentId === parentId && !excluded.has(trip.id)) {
        excluded.add(trip.id);
        pending.push(trip.id);
      }
    }
  }
  return excluded;
}

/** Return available parents excluding this trip and its descendants, including in cyclic catalogues. */
export function eligibleParents(state: SettingsState): SettingsState['trips'] {
  const excluded = descendantIds(state);
  return state.trips.filter((trip) => !excluded.has(trip.id));
}

/** Validate only captured dates and selected references; parent dates do not constrain child dates. */
export function settingsFindings(state: SettingsState): SettingsFinding[] {
  const findings: SettingsFinding[] = [];
  const { trip } = state;
  for (const field of ['start', 'end'] as const) {
    if (trip[field] && !isTripDate(trip[field]))
      findings.push({ id: `invalid-${field}`, message: `Enter a valid ${field} date.` });
  }
  if (isTripDate(trip.start) && isTripDate(trip.end) && trip.end < trip.start)
    findings.push({ id: 'reversed-dates', message: 'The end date is before the start date.' });
  if (trip.tagId && !state.tags.some((tag) => tag.id === trip.tagId))
    findings.push({
      id: 'missing-tag',
      message: 'Choose an available tag or clear the selection.',
    });
  if (trip.parentId) {
    if (descendantIds(state).has(trip.parentId))
      findings.push({
        id: 'parent-cycle',
        message: 'A trip cannot be its own parent or descendant.',
      });
    else if (!state.trips.some((parent) => parent.id === trip.parentId))
      findings.push({
        id: 'missing-parent',
        message: 'Choose an available parent trip or clear the selection.',
      });
  }
  return findings;
}

/** Save an independent draft snapshot only when valid; retain the state unchanged on findings. */
export function saveSettings(state: SettingsState): SettingsState {
  return settingsFindings(state).length ? state : { ...state, saved: { ...state.trip } };
}
