import type { IdeaState } from './model';

/** Named snapshots for reviewing complete, optional and unavailable source states. */
export type IdeaScenario = 'default' | 'empty' | 'undated' | 'outside-visit' | 'missing-reference';

/** Explicit idea kind choices; labels carry no additional domain semantics. */
export const ideaKinds: { value: IdeaState['kind']; label: string }[] = [
  { value: 'destination', label: 'Destination' },
  { value: 'place', label: 'Place' },
  { value: 'activity', label: 'Activity' },
];

/** Explicit reasons for keeping an idea. */
export const ideaPurposes: { value: IdeaState['purpose']; label: string }[] = [
  { value: 'visit', label: 'Visit' },
  { value: 'meet-people', label: 'Meet people' },
  { value: 'see-someone', label: 'See someone' },
  { value: 'other', label: 'Other' },
];

/** Local planning statuses, independent from route membership. */
export const ideaStatuses: { value: IdeaState['status']; label: string }[] = [
  { value: 'Saved', label: 'Saved' },
  { value: 'Considering', label: 'Considering' },
  { value: 'In plan', label: 'In plan' },
];

/** Capture precision choices do not supply missing dates. */
export const timingModes: { value: IdeaState['timing']['mode']; label: string }[] = [
  { value: 'none', label: 'No timing' },
  { value: 'month', label: 'Month' },
  { value: 'dates', label: 'Dates' },
];

function sourceIdea(): IdeaState {
  return {
    name: 'Neighbourhood drawing circle',
    kind: 'activity',
    purpose: 'meet-people',
    status: 'Saved',
    reason: 'Meet local people through a relaxed shared activity.',
    cityId: 'belo-horizonte',
    address: 'Rua das Acácias, 24 · Belo Horizonte',
    timing: { mode: 'month', month: '2028-01', from: '', to: '' },
    visitId: 'visit-bh',
    contacts: [
      { id: 'lina', name: 'Lina Prado' },
      { id: 'tomas', name: 'Tomás Vale' },
    ],
    recommendations: [
      {
        id: 'recommendation-lina',
        contactId: 'lina',
        note: 'Lina mentioned a friendly group that welcomes visitors.',
      },
    ],
    links: [
      { id: 'drawing-circle', label: 'Group page', url: 'https://drawing-circle.example/meetups' },
    ],
    cities: [
      { id: 'olinda', name: 'Olinda' },
      { id: 'belo-horizonte', name: 'Belo Horizonte' },
      { id: 'rio', name: 'Rio de Janeiro' },
    ],
    visits: [
      { id: 'visit-olinda', cityId: 'olinda', from: '2027-12-29', to: '2028-01-06' },
      { id: 'visit-bh', cityId: 'belo-horizonte', from: '2028-01-21', to: '2028-01-25' },
      { id: 'visit-rio', cityId: 'rio', from: '2028-02-05', to: '2028-02-13' },
    ],
    notes: 'Ask about the next gathering before choosing a day.',
  };
}

/** Create independent fictional source data for every workspace and reset. */
export function initialIdea(scenario: IdeaScenario = 'default'): IdeaState {
  const state = sourceIdea();
  if (scenario === 'empty')
    return {
      ...state,
      name: '',
      kind: 'place',
      purpose: 'other',
      reason: '',
      cityId: '',
      address: '',
      visitId: '',
      timing: { mode: 'none', month: '', from: '', to: '' },
      recommendations: [],
      links: [],
      notes: '',
    };
  if (scenario === 'undated') state.timing = { mode: 'none', month: '', from: '', to: '' };
  if (scenario === 'outside-visit')
    state.timing = { mode: 'dates', month: '', from: '2028-01-27', to: '2028-01-28' };
  if (scenario === 'missing-reference') {
    state.cityId = 'removed-city';
    state.visitId = 'removed-visit';
    state.recommendations = state.recommendations.map((entry) => ({
      ...entry,
      contactId: 'removed-contact',
    }));
  }
  return state;
}
