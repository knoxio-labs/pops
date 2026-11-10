import { tripPlaces } from '@/fixtures/trip-places';

import { initialPlanner } from './model';
import { pathPlaces, pathRecords, pathSections, pathTransit } from './path-fixtures';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { TripPlace } from '@/fixtures/trip-places';

import type { RouteSection, TransitLink } from './canvas-path-types';

export type { RouteSection, TransitLink } from './canvas-path-types';

import type { PlannerScenario, PlannerState } from './model';

/** A car hire period spans visits and retains its own pickup/return dates. */
export interface RentalPeriod {
  id: string;
  provider: string;
  from: string;
  to: string;
  start: string;
  end: string;
  status: 'Considering' | 'Reserved' | 'Purchased';
}
/** Serializable local planning state; all displayed labels are source fields or projections. */
export interface CanvasState extends PlannerState {
  places: TripPlace[];
  sections: RouteSection[];
  /** Applied path source receipts retain identity after exclusive placement moves into root order. */
  appliedPaths: RouteSection[];
  transitLinks: Record<string, TransitLink>;
  rentals: RentalPeriod[];
  itemOrders: Record<string, string[]>;
  activityStays: Record<string, string>;
  homePlaces: string[];
  buffers: Record<string, number>;
  clockOverrides: Record<string, { startAt?: string; endAt?: string }>;
}

const extraRecords: TripRecord[] = [
  {
    id: 'hotel-second',
    title: 'Hotel da Praça',
    kind: 'stay',
    placeId: 'recife-olinda',
    visitId: 'recife',
    schedule: { start: '2028-01-03', end: '2028-01-05' },
    intention: 'In plan',
    arrangement: 'Booked',
    notes: '',
  },
  {
    id: 'dinner',
    title: 'Dinner with friends',
    kind: 'event',
    placeId: 'porto-alegre',
    visitId: 'family',
    schedule: { start: '2027-12-28', localTime: '21:00' },
    intention: 'In plan',
    arrangement: 'Agreed',
    notes: '',
  },
  {
    id: 'walk',
    title: 'Walk in the old town',
    kind: 'idea',
    placeId: 'recife-olinda',
    visitId: 'recife',
    intention: 'Considering',
    arrangement: 'Not needed',
    notes: '',
  },
  {
    id: 'friends',
    title: 'Meet friends',
    kind: 'idea',
    placeId: 'recife-olinda',
    visitId: 'recife',
    intention: 'Considering',
    arrangement: 'Not needed',
    notes: '',
  },
];

const defaultRentals: RentalPeriod[] = [
  {
    id: 'rental-1',
    provider: 'Rental car',
    from: 'curitiba',
    to: 'family',
    start: '2027-12-14',
    end: '2027-12-29',
    status: 'Reserved',
  },
];

/** Build the shared fictional route with split accommodation and timed activities. */
export function initialCanvas(scenario: PlannerScenario): CanvasState {
  const base = initialPlanner(scenario);
  const places = structuredClone(tripPlaces);
  const transitLinks: Record<string, TransitLink> =
    scenario === 'empty'
      ? {}
      : {
          flight: { from: 'sydney-out', to: 'arrival' },
          connection: { from: 'family', to: 'recife' },
          'return-flight': { from: 'florianopolis', to: 'sydney-return' },
        };
  const order = base.order.flatMap((id) => [
    id,
    ...Object.entries(transitLinks)
      .filter(([, link]) => link.from === id)
      .map(([key]) => key),
  ]);
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
      ...(scenario === 'empty' ? [] : structuredClone(extraRecords)),
      ...(scenario === 'empty' ? [] : structuredClone(pathRecords)),
    ],
    order,
    places: [...places, ...(scenario === 'empty' ? [] : structuredClone(pathPlaces))],
    sections: scenario === 'empty' ? [] : structuredClone(pathSections),
    appliedPaths: [],
    transitLinks: { ...transitLinks, ...(scenario === 'empty' ? {} : pathTransit) },
    itemOrders: {},
    activityStays: {},
    homePlaces: ['sydney'],
    buffers: {},
    clockOverrides: {},
    rentals: scenario === 'empty' ? [] : structuredClone(defaultRentals),
  };
}

/** Resolve place references from fixture and locally created place records. */
export function canvasName(state: CanvasState, record: TripRecord): string {
  return record.title ?? state.places.find((p) => p.id === record.placeId)?.name ?? '';
}
