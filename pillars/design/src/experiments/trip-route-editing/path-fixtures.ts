import { initialCanvas } from './canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { TripPlace } from '@/fixtures/trip-places';

import type { CanvasState } from './canvas-model';
import type { RouteSection, TransitLink } from './canvas-path-types';
import type { PlannerScenario } from './model';

/** Fictional complete paths have explicit occurrence, booking and transport identities. */
export const pathPlaces: TripPlace[] = [
  { id: 'belo-horizonte', name: 'Belo Horizonte', kind: 'city' },
  { id: 'maceio', name: 'Maceió', kind: 'city' },
  { id: 'salvador', name: 'Salvador', kind: 'city' },
  { id: 'ouro-preto', name: 'Ouro Preto', kind: 'city' },
];

/** Two multi-city options keep their own source dates and linked accommodation. */
export const pathRecords: TripRecord[] = [
  {
    id: 'coast-maceio',
    kind: 'city',
    placeId: 'maceio',
    timing: { arrival: '2028-01-06', departure: '2028-01-10' },
    intention: 'Alternative',
    arrangement: 'Not needed',
    notes: '',
  },
  {
    id: 'coast-salvador',
    kind: 'city',
    placeId: 'salvador',
    timing: { arrival: '2028-01-10', departure: '2028-01-15' },
    intention: 'Alternative',
    arrangement: 'Not needed',
    notes: '',
  },
  {
    id: 'coast-flight',
    kind: 'transport',
    title: 'Maceió → Salvador flight',
    placeId: 'salvador',
    schedule: { start: '2028-01-10', localTime: '10:00' },
    intention: 'Alternative',
    arrangement: 'Not arranged',
    notes: '',
  },
  {
    id: 'coast-stay',
    kind: 'stay',
    title: 'Casa do Farol',
    placeId: 'maceio',
    visitId: 'coast-maceio',
    schedule: { start: '2028-01-06', end: '2028-01-10' },
    intention: 'Alternative',
    arrangement: 'Booked',
    notes: '',
  },
  {
    id: 'coast-salvador-stay',
    kind: 'stay',
    title: 'Pousada da Praça',
    placeId: 'salvador',
    visitId: 'coast-salvador',
    schedule: { start: '2028-01-10', end: '2028-01-15' },
    intention: 'Alternative',
    arrangement: 'Booked',
    purchase: 'Purchased',
    notes: '',
  },
  {
    id: 'minas-bh',
    kind: 'city',
    placeId: 'belo-horizonte',
    timing: { arrival: '2028-01-06', departure: '2028-01-09' },
    intention: 'Alternative',
    arrangement: 'Not needed',
    notes: '',
  },
  {
    id: 'minas-ouro',
    kind: 'city',
    placeId: 'ouro-preto',
    timing: { arrival: '2028-01-09', departure: '2028-01-15' },
    intention: 'Alternative',
    arrangement: 'Not needed',
    notes: '',
  },
  {
    id: 'minas-bus',
    kind: 'transport',
    title: 'Belo Horizonte → Ouro Preto bus',
    placeId: 'ouro-preto',
    schedule: { start: '2028-01-09', localTime: '09:00' },
    intention: 'Alternative',
    arrangement: 'Not arranged',
    notes: '',
  },
  {
    id: 'minas-stay',
    kind: 'stay',
    title: 'Hotel do Mercado',
    placeId: 'belo-horizonte',
    visitId: 'minas-bh',
    schedule: { start: '2028-01-06', end: '2028-01-09' },
    intention: 'Alternative',
    arrangement: 'Booked',
    notes: '',
  },
  {
    id: 'minas-ouro-stay',
    kind: 'stay',
    title: 'Casa das Pedras',
    placeId: 'ouro-preto',
    visitId: 'minas-ouro',
    schedule: { start: '2028-01-09', end: '2028-01-15' },
    intention: 'Alternative',
    arrangement: 'Booked',
    notes: '',
  },
];

/** Path order contains route cards; stays remain linked through their explicit visit IDs. */
export const pathSections: RouteSection[] = [
  {
    id: 'path-coast',
    gapId: 'open-january',
    title: 'Coastal route',
    cards: ['coast-maceio', 'coast-flight', 'coast-salvador'],
  },
  {
    id: 'path-minas',
    gapId: 'open-january',
    title: 'Minas route',
    cards: ['minas-bh', 'minas-bus', 'minas-ouro'],
  },
];

/** Transport endpoints refer to visit occurrences rather than city labels. */
export const pathTransit: Record<string, TransitLink> = {
  'coast-flight': { from: 'coast-maceio', to: 'coast-salvador' },
  'minas-bus': { from: 'minas-bh', to: 'minas-ouro' },
};

/** Build the approved Direct route examples without replacing other prototypes’ shared source fixtures. */
export function initialRouteCanvas(scenario: PlannerScenario): CanvasState {
  const base = initialCanvas(scenario);
  if (scenario === 'empty') return base;
  return {
    ...base,
    records: [
      ...base.records.map((record) =>
        record.kind === 'gap'
          ? {
              ...record,
              optionIds: pathSections
                .filter((section) => section.gapId === record.id)
                .flatMap((section) => section.cards),
            }
          : record
      ),
      ...structuredClone(pathRecords),
    ],
    places: [...base.places, ...structuredClone(pathPlaces)],
    sections: structuredClone(pathSections),
    transitLinks: { ...base.transitLinks, ...structuredClone(pathTransit) },
  };
}
