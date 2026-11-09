import {
  initialPerson,
  visits as contactVisits,
  type Person,
} from '../contact-person-detail/model';
import { canvasName, initialCanvas } from '../trip-route-editing/canvas-model';

import type { PeopleScenario, TripPeopleState, TripPersonPlan } from './types';

/** Named fictional source review states. */
export type { PeopleScenario } from './types';

function sourcePeople(scenario: PeopleScenario) {
  const marina = initialPerson(scenario === 'conflicting' ? 'conflicting' : 'default');
  const lina = {
    ...initialPerson('new'),
    name: 'Lina Prado',
    notes: 'Ask Lina about meeting in Olinda.',
    methods: [{ id: 'lina-email', kind: 'Email', label: 'Personal', value: 'lina@example.test' }],
    availability: [
      {
        id: 'lina-unavailable',
        city: 'recife-olinda',
        start: '2027-12-30',
        end: '2028-01-02',
        status: 'Unavailable',
      },
    ],
  };
  const other = {
    ...initialPerson('new'),
    name: 'Marina Duarte',
    notes: 'A separate contact from the Sydney drawing group.',
    methods: [
      { id: 'other-email', kind: 'Email', label: 'Studio', value: 'other-marina@example.test' },
    ],
  };
  return { marina, lina, other };
}

function sourcePlans(marina: Person): TripPersonPlan[] {
  return [
    {
      id: 'plan-marina',
      contactId: 'contact-marina',
      visitId: 'family',
      title: marina.plans[0]?.title ?? '',
      notes: marina.plans[0]?.notes ?? '',
      intention: 'Planned',
      agreement: 'Agreed',
      from: '2027-12-24',
      to: '2027-12-24',
    },
    {
      id: 'plan-lina',
      contactId: 'contact-lina',
      visitId: 'recife',
      title: 'Walk with Lina',
      notes: 'Ask which day works.',
      intention: 'Considering',
      agreement: 'Not agreed',
      from: '',
      to: '',
    },
    {
      id: 'plan-other-out',
      contactId: 'contact-marina-other',
      visitId: 'sydney-out',
      title: 'Drawing group catch-up',
      notes: '',
      intention: 'Considering',
      agreement: 'Not agreed',
      from: '',
      to: '',
    },
    {
      id: 'plan-other-return',
      contactId: 'contact-marina-other',
      visitId: 'sydney-return',
      title: 'Catch up after returning',
      notes: '',
      intention: 'Planned',
      agreement: 'Not agreed',
      from: '',
      to: '',
    },
  ];
}

/** Builds independent sources; the conflicting variant explicitly captures matching C02 source visit bounds. */
export function createTripPeopleState(scenario: PeopleScenario = 'default'): TripPeopleState {
  const canvas = initialCanvas('default');
  const { marina, lina, other } = sourcePeople(scenario);
  const state: TripPeopleState = {
    contacts: [
      { id: 'contact-marina', person: marina },
      { id: 'contact-lina', person: lina },
      { id: 'contact-marina-other', person: other },
    ],
    visits: canvas.order.flatMap((id) => {
      const record = canvas.records.find((entry) => entry.id === id);
      return record?.kind === 'city'
        ? [
            {
              id: record.id,
              cityId: record.placeId,
              name: canvasName(canvas, record),
              from: record.timing?.arrival ?? '',
              to: record.timing?.departure ?? '',
            },
          ]
        : [];
    }),
    cities: canvas.places.map(({ id, name }) => ({ id, name })),
    plans: sourcePlans(marina),
  };
  if (scenario === 'empty') return { ...state, plans: [] };
  if (scenario === 'undated')
    state.visits = state.visits.map((visit) => ({ ...visit, from: '', to: '' }));
  if (scenario === 'conflicting')
    state.visits = state.visits.map((visit) => {
      const source = contactVisits.find(
        (entry) => entry.id === visit.id && entry.city === visit.cityId
      );
      return source ? { ...visit, from: source.start, to: source.end } : visit;
    });
  if (scenario === 'missing-reference')
    state.plans = state.plans.map((plan, index) =>
      index === 0 ? { ...plan, contactId: 'removed-contact', visitId: 'removed-visit' } : plan
    );
  return state;
}
