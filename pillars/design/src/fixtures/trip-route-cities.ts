import type { TripCityTiming, TripRecord } from './trip-overview-model';

function city(input: {
  id: string;
  placeId: string;
  timing: TripCityTiming;
  sequence?: number;
  notes?: string;
}): TripRecord {
  return {
    id: input.id,
    kind: 'city',
    placeId: input.placeId,
    intention: input.sequence === undefined ? 'Alternative' : 'In plan',
    arrangement: 'Not arranged',
    notes: input.notes ?? '',
    timing: input.timing,
    sequence: input.sequence,
  };
}

/** Fictional 2027–28 data uses ISO dates, month precision and visit references. */
export const tripRouteCities: TripRecord[] = [
  city({ id: 'sydney-out', placeId: 'sydney', timing: { departure: '2027-11-24' }, sequence: 0 }),
  city({ id: 'arrival', placeId: 'sao-paulo', timing: { arrival: '2027-11-25' }, sequence: 1 }),
  city({ id: 'curitiba', placeId: 'curitiba', timing: {}, sequence: 2 }),
  city({ id: 'family', placeId: 'porto-alegre', timing: { departure: '2027-12-29' }, sequence: 3 }),
  city({
    id: 'recife',
    placeId: 'recife-olinda',
    timing: { arrival: '2027-12-29', departure: '2028-01-06' },
    sequence: 4,
  }),
  {
    id: 'open-january',
    kind: 'gap',
    placeId: 'recife-olinda',
    timing: { afterVisitId: 'recife', beforeVisitId: 'rio' },
    intention: 'Considering',
    arrangement: 'Not arranged',
    notes: '',
    sequence: 5,
    optionIds: ['northeast', 'minas', 'es', 'curitiba-return'],
  },
  city({ id: 'rio', placeId: 'rio', timing: {}, sequence: 6 }),
  city({
    id: 'florianopolis',
    placeId: 'florianopolis',
    timing: { afterVisitId: 'rio', beforeVisitId: 'sydney-return' },
    sequence: 7,
  }),
  city({
    id: 'sydney-return',
    placeId: 'sydney',
    timing: { afterVisitId: 'florianopolis' },
    sequence: 8,
  }),
  city({ id: 'northeast', placeId: 'northeast', timing: { month: { year: 2028, month: 1 } } }),
  city({
    id: 'minas',
    placeId: 'minas',
    timing: { month: { year: 2028, month: 1 }, duration: { min: 2, max: 3, unit: 'weeks' } },
    notes: 'Meet people.',
  }),
  city({ id: 'es', placeId: 'es', timing: { afterVisitId: 'recife', beforeVisitId: 'rio' } }),
  city({
    id: 'curitiba-return',
    placeId: 'curitiba',
    timing: { afterVisitId: 'recife', beforeVisitId: 'rio' },
  }),
];
