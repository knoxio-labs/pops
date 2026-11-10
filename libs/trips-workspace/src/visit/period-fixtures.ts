import type { Stay, TripEvent, Visit } from './types';

/** Independent fictional visit occurrence with partial source timing. */
export function sourceVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 31,
    tripId: 7,
    placeId: 51,
    timing: { arrival: '2030-04-10', departure: '2030-04-16' },
    notes: 'Visit notes',
    sourceLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Independent source accommodation; checkout remains exclusive. */
export function sourceStay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: 13,
    tripId: 7,
    visitId: 31,
    name: 'Cedar guesthouse',
    kind: 'hotel',
    status: 'Reserved',
    timing: { arrival: '2030-04-10', departure: '2030-04-13' },
    address: null,
    reference: null,
    notes: '',
    sourceLinks: [],
    hostLinks: [],
    documentLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}
/** Independent source activity including explicit Alternative intention. */
export function sourceEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: 41,
    tripId: 7,
    visitId: 31,
    name: 'Harbour concert',
    intention: 'Alternative',
    arrangement: 'Booked',
    purchase: null,
    timing: { start: '2030-04-13', startTime: '19:30', timeZone: 'Pacific/Auckland' },
    address: null,
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [],
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
    createdAt: '2030-01-01T00:00:00Z',
    updatedAt: '2030-01-01T00:00:00Z',
    ...overrides,
  };
}
