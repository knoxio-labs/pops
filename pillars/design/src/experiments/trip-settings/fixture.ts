import type { SettingsState, TripSettings } from './model';

/** Fictional settings snapshots for existing, new, nested and invalid trips. */
export type SettingsScenario =
  | 'default'
  | 'existing'
  | 'empty'
  | 'nested'
  | 'month'
  | 'season'
  | 'open-route'
  | 'arbitrary-when'
  | 'missing-reference';

function brazilSettings(): SettingsState {
  const trip: TripSettings = {
    id: 'trip-brazil',
    name: '',
    destination: 'Brazil',
    when: '',
    tagId: 'travel-brazil',
    parentId: '',
    notes: '',
  };
  return {
    trip,
    trips: [
      { id: 'trip-brazil', name: 'Brazil · 2027', parentId: '' },
      { id: 'trip-olinda', name: 'Olinda', parentId: 'trip-brazil' },
      { id: 'trip-rio', name: 'Rio de Janeiro', parentId: 'trip-brazil' },
      { id: 'trip-rio-weekend', name: 'Rio weekend', parentId: 'trip-rio' },
      { id: 'trip-south-america', name: 'South America', parentId: '' },
    ],
    tags: [
      { id: 'travel-brazil', name: 'Travel / Brazil' },
      { id: 'travel', name: 'Travel' },
    ],
    route: [
      {
        id: 'journey-syd-gru',
        title: 'Sydney → São Paulo',
        kind: 'journey',
        start: '2027-11-24',
        end: '2027-11-25',
      },
      { id: 'visit-sp', title: 'São Paulo', kind: 'visit', start: '2027-11-25', end: '' },
      {
        id: 'visit-rio',
        title: 'Rio de Janeiro',
        kind: 'visit',
        start: '2028-02-05',
        end: '2028-02-13',
      },
      { id: 'journey-return', title: 'Return journey', kind: 'journey', start: '', end: '' },
    ],
    saved: { ...trip },
  };
}

/** Return an independent editable snapshot with catalogues retained for optional selection. */
export function initialSettings(scenario: SettingsScenario = 'default'): SettingsState {
  const state = brazilSettings();
  if (scenario === 'default')
    return { ...state, trip: { ...state.trip, id: 'draft-trip' }, saved: null, route: [] };
  if (scenario === 'empty')
    return {
      ...state,
      trip: {
        id: 'trip-new',
        name: '',
        destination: '',
        when: '',
        tagId: '',
        parentId: '',
        notes: '',
      },
      saved: null,
      route: [],
    };
  if (scenario === 'nested') {
    const trip = { ...state.trip, parentId: 'trip-south-america' };
    return { ...state, trip, saved: { ...trip } };
  }
  if (scenario === 'month')
    return {
      ...state,
      trip: { ...state.trip, id: 'draft-trip', when: 'Around July' },
      saved: null,
      route: [],
    };
  if (scenario === 'season')
    return {
      ...state,
      trip: { ...state.trip, id: 'draft-trip', when: 'Summer 2027–28' },
      saved: null,
      route: [],
    };
  if (scenario === 'arbitrary-when')
    return {
      ...state,
      trip: { ...state.trip, id: 'draft-trip', when: 'After the exams, if possible' },
      saved: null,
      route: [],
    };
  if (scenario === 'missing-reference')
    return {
      ...state,
      trip: { ...state.trip, tagId: 'removed-tag', parentId: 'removed-trip' },
    };
  if (scenario === 'open-route')
    return {
      ...state,
      route: state.route.map((record, index) => ({
        ...record,
        start: index === 0 ? '' : record.start,
        end: index === state.route.length - 1 ? '' : record.end,
      })),
    };
  return state;
}
