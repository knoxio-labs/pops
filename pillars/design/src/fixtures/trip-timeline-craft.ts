import { tripRouteArrangements } from './trip-route-arrangements';

import type { CraftTimeline } from './trip-timeline-craft-types';

export type {
  CraftArrangementState,
  CraftEndpoint,
  CraftFlight,
  CraftStay,
  CraftActivity,
  CraftAccommodationGap,
  CraftThought,
  CraftVisitItem,
  CraftVisit,
  CraftTimeline,
  CraftSpendingRecord,
  CraftSpendingState,
  CraftFinanceIntent,
} from './trip-timeline-craft-types';

const hotel = tripRouteArrangements.find((item) => item.id === 'hotel');
const concert = tripRouteArrangements.find((item) => item.id === 'ticket');
if (!hotel?.title || !hotel.schedule?.end || !concert?.title || !concert.schedule) {
  throw new Error('The shared fictional accommodation and concert fixtures are required.');
}

/** Existing fictional coast arrangements, with a fully specified fictional incoming flight. */
export const craftTimeline: CraftTimeline = {
  title: 'Summer along the coast',
  subtitle: 'Brazil · December 2027 onwards · Return date open',
  documents: [
    { id: 'craft-flight-document', title: 'Flight confirmation', source: 'Coastline Air · CL 214' },
    { id: 'craft-hotel-document', title: 'Reservation', source: hotel.title },
    { id: 'craft-concert-document', title: 'Tickets', source: concert.title },
  ],
  rows: [
    {
      kind: 'visit',
      id: 'craft-porto-alegre',
      placeId: 'porto-alegre',
      departure: '2027-12-29',
      coverage: 'unknown',
      items: [],
      notes: 'A few slow days before heading north. Keep the last evening free.',
    },
    {
      kind: 'flight',
      id: 'craft-flight-recife',
      departure: {
        placeId: 'airport-poa',
        date: '2027-12-29',
        localTime: '10:05',
        timeZone: 'America/Sao_Paulo',
      },
      arrival: {
        placeId: 'airport-rec',
        date: '2027-12-29',
        localTime: '13:20',
        timeZone: 'America/Recife',
      },
      carrier: 'Coastline Air',
      service: 'CL 214',
      state: 'Purchased',
      handledBy: 'Marina',
      notes: 'Keep the confirmation with the other trip documents.',
    },
    {
      kind: 'visit',
      id: 'craft-recife',
      placeId: 'recife-olinda',
      arrival: '2027-12-29',
      departure: '2028-01-06',
      coverage: 'known',
      notes:
        'Walk through Olinda, leave time for the beach, and ask Marina about a good lunch spot.',
      items: [
        {
          kind: 'stay',
          id: 'craft-hotel',
          title: hotel.title,
          checkIn: hotel.schedule.start,
          checkOut: hotel.schedule.end,
          state: 'Purchased',
          handledBy: 'Marina',
          notes: 'The courtyard room. Check-in and check-out times have not been supplied.',
        },
        {
          kind: 'activity',
          icon: 'music',
          id: 'craft-concert',
          title: concert.title,
          date: concert.schedule.start,
          localTime: concert.schedule.localTime,
          state: 'Purchased',
          notes: 'Two tickets. Venue details can be added later.',
        },
        {
          kind: 'accommodation-gap',
          id: 'craft-recife-nights',
          start: '2028-01-03',
          end: '2028-01-06',
        },
        {
          kind: 'stay',
          id: 'craft-guesthouse-idea',
          title: 'Casa das Mangueiras',
          checkIn: '2028-01-03',
          checkOut: '2028-01-06',
          state: 'Considering',
          notes: 'A possibility for the last few nights. No reservation has been made.',
        },
        { kind: 'thought', id: 'craft-thought', title: 'A day in Itamaracá, if we feel like it' },
      ],
    },
    {
      kind: 'flight',
      id: 'craft-flight-rio',
      state: 'Considering',
      departure: { placeId: 'airport-rec', date: '2028-01-06' },
      arrival: { placeId: 'rio' },
      notes: 'Travel date is an idea; arrival and clocks are not set.',
    },
    {
      kind: 'visit',
      id: 'craft-rio',
      placeId: 'rio',
      coverage: 'unknown',
      items: [{ kind: 'thought', id: 'craft-rio-thought', title: 'Spend a little longer here' }],
    },
  ],
};

/** The same layout with date-only and unknown data, without invented clocks or arrangements. */
export const sparseCraftTimeline: CraftTimeline = {
  title: 'An open-ended summer',
  subtitle: 'Brazil · From 29 December 2027 · Return date open',
  documents: [],
  rows: [
    {
      kind: 'flight',
      id: 'sparse-flight',
      state: null,
      departure: { placeId: 'airport-poa', date: '2027-12-29' },
      arrival: { placeId: 'airport-rec' },
      notes:
        'Departure day is known. Airline, clocks, arrival date and booking state are not supplied.',
    },
    {
      kind: 'visit',
      id: 'sparse-recife',
      placeId: 'recife-olinda',
      coverage: 'unknown',
      items: [
        { kind: 'thought', id: 'sparse-thought', title: 'Look for somewhere near the old town' },
      ],
    },
    { kind: 'visit', id: 'sparse-rio', placeId: 'rio', coverage: 'unknown', items: [] },
  ],
};
