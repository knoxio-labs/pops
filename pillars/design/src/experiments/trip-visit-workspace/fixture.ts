import { initialCanvas } from '../trip-route-editing/canvas-model';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from '../trip-route-editing/canvas-model';

/** Review states exercise incomplete dates, missing arrangements and overlapping nights. */
export type VisitScenario = 'default' | 'empty' | 'overlap' | 'approximate' | 'repeat-visit';

/** Both layouts use the same fictional route; this visit adds local people and a car hire period. */
export function visitCanvas(scenario: VisitScenario = 'default'): CanvasState {
  const state = initialCanvas('default');
  const records: TripRecord[] = state.records.map((record) => {
    if (record.id === 'friends')
      return {
        ...record,
        kind: 'person',
        title: 'Marina',
        arrangement: 'Agreed',
        intention: 'In plan',
        schedule: { start: '2028-01-03', localTime: '18:00' },
      };
    if (record.id === 'recife' && scenario === 'approximate')
      return { ...record, timing: { month: { year: 2028, month: 1 } } };
    if (record.id === 'hotel-second' && scenario === 'overlap')
      return { ...record, schedule: { start: '2028-01-02', end: '2028-01-05' } };
    return record;
  });
  if (scenario === 'repeat-visit') {
    records.push({
      id: 'recife-return',
      kind: 'city',
      placeId: 'recife-olinda',
      timing: { arrival: '2028-01-20', departure: '2028-01-23' },
      intention: 'Considering',
      arrangement: 'Not arranged',
      notes: '',
    });
    state.order = [...state.order, 'recife-return'];
  }
  return {
    ...state,
    records: scenario === 'empty' ? records.filter((r) => r.visitId !== 'recife') : records,
    rentals: [
      ...state.rentals,
      ...(scenario === 'empty'
        ? []
        : [
            {
              id: 'rental-local',
              provider: 'Olinda car rental',
              from: 'recife',
              to: 'recife',
              start: '2027-12-30',
              end: '2028-01-04',
              status: 'Reserved' as const,
            },
          ]),
    ],
  };
}
