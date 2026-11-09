import { initialSettings } from '../trip-settings/fixture';

import type { HomeScenario, HomeState, HomeTrip } from './model';

function sampleTrip(id: string, destination: string, start: string, end: string): HomeTrip {
  return {
    settings: { id, name: '', destination, when: '', tagId: 'travel', parentId: '', notes: '' },
    route:
      start || end ? [{ id: `${id}-visit`, title: destination, kind: 'visit', start, end }] : [],
    updatedAt: '2027-12-01T09:00:00Z',
  };
}

/** Builds independent fictional trips with an explicit review date and source timing boundaries. */
export function createTripsHomeState(scenario: HomeScenario = 'default'): HomeState {
  const brazil = initialSettings('existing');
  const current = sampleTrip('trip-curitiba', 'Curitiba', '2027-12-13', '2027-12-20');
  current.updatedAt = '2027-12-15T11:30:00Z';
  const past = sampleTrip('trip-hobart', 'Hobart', '2027-09-10', '2027-09-14');
  past.updatedAt = '2027-09-15T10:00:00Z';
  const idea = sampleTrip('trip-idea', 'Portugal', '', '');
  idea.settings.when = 'Around July';
  const nested = sampleTrip('trip-olinda', 'Olinda', '2027-12-29', '2028-01-03');
  nested.settings.parentId = 'trip-brazil';
  const state: HomeState = {
    trips: [
      { settings: brazil.trip, route: brazil.route, updatedAt: '2027-12-14T08:00:00Z' },
      current,
      past,
      idea,
      nested,
    ],
    tags: brazil.tags,
    referenceDate: '2027-12-16',
  };
  if (scenario === 'empty') return { ...state, trips: [] };
  if (scenario === 'open-dates')
    current.route = current.route.map((record) => ({ ...record, end: '' }));
  if (scenario === 'missing-parent') nested.settings.parentId = 'removed-trip';
  if (scenario === 'conflicting-dates')
    current.route = current.route.map((record) => ({
      ...record,
      start: '2027-12-20',
      end: '2027-12-13',
    }));
  return state;
}
