import type { RouteTiming } from './timing-model';

export { routeSummary } from './timing-model';

/** Editable fictional trip settings; empty strings represent unknown optional values. */
export interface TripSettings {
  id: string;
  name: string;
  destination: string;
  when: string;
  tagId: string;
  parentId: string;
  notes: string;
}

/** Draft and saved settings with independently owned reference catalogues. */
export interface SettingsState {
  trip: TripSettings;
  trips: { id: string; name: string; parentId: string }[];
  tags: { id: string; name: string }[];
  route: RouteTiming[];
  saved: TripSettings | null;
}

/** An invalid captured value or unavailable selected reference that prevents saving. */
export interface SettingsFinding {
  id: string;
  message: string;
}

/** Use a custom name or destination; timing text and route dates never contribute to the title. */
export function settingsTitle(trip: TripSettings): string {
  if (trip.name.trim()) return trip.name.trim();
  return trip.destination.trim() || 'Trip';
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

/** Validate selected references independently of free timing text and route dates. */
export function settingsFindings(state: SettingsState): SettingsFinding[] {
  const findings: SettingsFinding[] = [];
  const { trip } = state;
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
