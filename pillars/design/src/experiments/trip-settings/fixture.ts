import type { SettingsState, TripSettings } from './model';

/** Fictional settings snapshots for existing, new, nested and invalid trips. */
export type SettingsScenario =
  | 'default'
  | 'existing'
  | 'empty'
  | 'nested'
  | 'reversed-dates'
  | 'missing-reference';

function brazilSettings(): SettingsState {
  const trip: TripSettings = {
    id: 'trip-brazil',
    name: '',
    destination: 'Brazil',
    start: '2027-11-24',
    end: '',
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
    saved: { ...trip },
  };
}

/** Return an independent editable snapshot with catalogues retained for optional selection. */
export function initialSettings(scenario: SettingsScenario = 'default'): SettingsState {
  const state = brazilSettings();
  if (scenario === 'default')
    return { ...state, trip: { ...state.trip, id: 'draft-trip' }, saved: null };
  if (scenario === 'empty')
    return {
      ...state,
      trip: {
        id: 'trip-new',
        name: '',
        destination: '',
        start: '',
        end: '',
        tagId: '',
        parentId: '',
        notes: '',
      },
      saved: null,
    };
  if (scenario === 'nested') {
    const trip = { ...state.trip, parentId: 'trip-south-america' };
    return { ...state, trip, saved: { ...trip } };
  }
  if (scenario === 'reversed-dates')
    return { ...state, trip: { ...state.trip, end: '2027-11-23' } };
  if (scenario === 'missing-reference')
    return {
      ...state,
      trip: { ...state.trip, tagId: 'removed-tag', parentId: 'removed-trip' },
    };
  return state;
}
