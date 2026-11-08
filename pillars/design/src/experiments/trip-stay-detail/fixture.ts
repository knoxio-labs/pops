import type { StayState } from './model';

/** Named fictional snapshots for capture, agreed hospitality, date conflict and broken links. */
export type StayScenario = 'default' | 'empty' | 'family' | 'overlap' | 'missing-reference';

function hotel(): StayState {
  return {
    name: 'Hotel Jardim do Sol',
    kind: 'hotel',
    status: 'Reserved',
    visit: { id: 'sao-paulo', name: 'São Paulo', from: '2028-01-16', to: '2028-01-23' },
    from: '2028-01-16',
    to: '2028-01-20',
    checkIn: '15:00',
    checkOut: '11:00',
    timeZone: 'America/Sao_Paulo',
    address: 'Rua do Jardim, 120 · São Paulo',
    hostId: 'contact-jardim',
    hosts: [
      { id: 'contact-jardim', name: 'Hotel Jardim reception', method: 'reception@jardim.example' },
      { id: 'contact-marina', name: 'Marina Costa', method: 'marina@family.example' },
    ],
    reference: 'JDS-4821',
    notes: 'Late arrival noted with reception. Ask about luggage storage on checkout day.',
    documentIds: ['document-confirmation'],
    documents: [
      { id: 'document-confirmation', name: 'Hotel reservation.pdf' },
      { id: 'document-directions', name: 'Arrival directions.pdf' },
    ],
    adjacent: [{ id: 'stay-vila', name: 'Hotel Vila Clara', from: '2028-01-20', to: '2028-01-23' }],
    activities: [
      { id: 'activity-market', title: 'Mercado visit', local: '2028-01-17T10:00' },
      { id: 'activity-lunch', title: 'Lunch with Marina', local: '2028-01-19T12:30' },
    ],
  };
}

/** Returns an independent editable snapshot; source catalogues survive empty capture and broken selections. */
export function initialStay(scenario: StayScenario = 'default'): StayState {
  const state = hotel();
  if (scenario === 'empty')
    return {
      ...state,
      name: '',
      status: 'Considering',
      from: '',
      to: '',
      checkIn: '',
      checkOut: '',
      timeZone: '',
      address: '',
      hostId: '',
      reference: '',
      notes: '',
      documentIds: [],
    };
  if (scenario === 'family')
    return {
      ...state,
      name: 'Marina’s home',
      kind: 'family',
      status: 'Agreed',
      hostId: 'contact-marina',
      address: 'Rua das Acácias, 42 · São Paulo',
      reference: '',
      documentIds: [],
      notes: 'Marina has agreed to host. Confirm arrival time with her.',
    };
  if (scenario === 'overlap') return { ...state, to: '2028-01-21' };
  if (scenario === 'missing-reference')
    return { ...state, hostId: 'contact-removed', documentIds: ['document-removed'] };
  return state;
}
