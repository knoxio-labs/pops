import type { BusinessScenario, BusinessState } from './model';

const defaultState: BusinessState = {
  business: {
    id: 'company-carmo',
    name: 'Pousada do Carmo',
    kind: 'company',
    aliases: [],
    notes: 'Ask reception about leaving bags before check-in.',
    methods: [
      {
        id: 'reservations',
        label: 'Reservations email',
        value: 'reservations@carmo.example.test',
      },
      { id: 'reception', label: 'Reception phone', value: '+55 81 5550 0142' },
    ],
    addresses: [],
    origin: 'Contacts',
  },
  websites: [{ id: 'official', label: 'Official website', url: 'https://carmo.example.test' }],
  locations: [
    {
      id: 'carmo-olinda',
      label: 'Olinda guesthouse',
      address: 'Rua do Carmo, 42',
      city: 'Olinda',
    },
    { id: 'carmo-recife', label: 'Recife office', address: 'Rua da Aurora, 108', city: 'Recife' },
  ],
  people: [
    { id: 'manager', contactId: 'marina-duarte', role: 'Manager', locationId: 'carmo-olinda' },
    { id: 'reception-person', contactId: 'lina-prado', role: 'Reception', locationId: '' },
  ],
  contacts: [
    { id: 'marina-duarte', name: 'Marina Duarte', method: 'marina@example.test' },
    { id: 'lina-prado', name: 'Lina Prado', method: 'lina@example.test' },
  ],
  arrangements: [
    {
      id: 'olinda-stay',
      title: 'Olinda stay',
      kind: 'stay',
      status: 'Purchased',
      businessId: 'company-carmo',
      locationId: 'carmo-olinda',
      from: '2027-12-29',
      to: '2028-01-03',
    },
  ],
};

/** Builds a fresh, fictional snapshot; business locations are the sole address source on this screen. */
export function createBusinessState(scenario: BusinessScenario = 'default'): BusinessState {
  const state = structuredClone(defaultState);
  if (scenario === 'empty')
    return {
      ...state,
      business: { ...state.business, notes: '', methods: [] },
      websites: [],
      locations: [],
      people: [],
      arrangements: [],
    };
  if (scenario === 'organisation')
    return {
      ...state,
      business: { ...state.business, name: 'Associação do Carmo', kind: 'organisation' },
    };
  if (scenario === 'missing-reference')
    return {
      ...state,
      people: [
        {
          id: 'missing-person',
          contactId: 'removed-contact',
          role: 'Coordinator',
          locationId: 'removed-location',
        },
      ],
      arrangements: state.arrangements.map((arrangement) => ({
        ...arrangement,
        locationId: 'removed-location',
      })),
    };
  return state;
}
