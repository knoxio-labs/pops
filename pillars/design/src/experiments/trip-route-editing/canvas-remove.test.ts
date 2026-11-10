import { describe, expect, it } from 'vitest';

import { initialCanvas } from './canvas-model';
import { removeCanvasVisit } from './canvas-remove';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from './canvas-model';

function record(id: string, overrides: Partial<TripRecord> = {}): TripRecord {
  return {
    id,
    kind: 'city',
    placeId: 'recife-olinda',
    intention: 'In plan',
    arrangement: 'Not needed',
    notes: '',
    ...overrides,
  };
}

function fixture(): CanvasState {
  return {
    ...initialCanvas('empty'),
    order: ['before', 'removed', 'after'],
    records: [
      record('before'),
      record('removed'),
      record('after'),
      record('event', {
        kind: 'event',
        visitId: 'removed',
        purchase: 'Purchased',
        arrangement: 'Booked',
        schedule: { start: '2028-01-02', localTime: '21:00' },
      }),
      record('stay', {
        kind: 'stay',
        visitId: 'removed',
        purchase: 'Purchased',
        arrangement: 'Booked',
        schedule: { start: '2028-01-01', end: '2028-01-05' },
      }),
      record('other-event', {
        kind: 'event',
        visitId: 'after',
        schedule: { start: '2028-01-03' },
      }),
    ],
    itemOrders: { source: ['event', 'stay'] },
    activityStays: { event: 'stay' },
  };
}

describe('removeCanvasVisit', () => {
  it('replaces a root visit with linked booking items while preserving their paid facts', () => {
    const state = fixture();
    const original = structuredClone(state);
    const next = removeCanvasVisit(state, 'removed');
    expect(next.order).toEqual(['before', 'event', 'stay', 'after']);
    expect(next.records.find((item) => item.id === 'removed')).toEqual(record('removed'));
    for (const id of ['event', 'stay']) {
      expect(next.records.find((item) => item.id === id)).toEqual({
        ...state.records.find((item) => item.id === id),
        visitId: undefined,
      });
    }
    expect(next.records.find((item) => item.id === 'other-event')).toEqual(
      state.records.find((item) => item.id === 'other-event')
    );
    expect(next.activityStays).toEqual({});
    expect(next.itemOrders.source).toEqual([]);
    expect(state).toEqual(original);
  });

  it('lifts children into the removed visit alternative section and refreshes its gap membership', () => {
    const source = fixture();
    const state: CanvasState = {
      ...source,
      order: ['gap'],
      records: [...source.records, record('gap', { kind: 'gap', optionIds: ['removed'] })],
      sections: [
        {
          id: 'section',
          gapId: 'gap',
          title: 'Alternative',
          cards: ['before', 'removed', 'after'],
        },
      ],
    };
    const next = removeCanvasVisit(state, 'removed');
    expect(next.order).toEqual(['gap']);
    expect(next.sections[0]?.cards).toEqual(['before', 'event', 'stay', 'after']);
    expect(next.records.find((item) => item.id === 'gap')?.optionIds).toEqual(
      next.sections[0]?.cards
    );
    expect(next.activityStays).toEqual({});
    for (const id of ['event', 'stay']) {
      expect(next.records.find((item) => item.id === id)).toEqual({
        ...state.records.find((item) => item.id === id),
        visitId: undefined,
      });
    }
  });

  it('clears affected invalid assignments while preserving unrelated assignments', () => {
    const source = fixture();
    const state = {
      ...source,
      activityStays: { ...source.activityStays, 'other-event': 'stay', unrelated: 'other-stay' },
    };
    const next = removeCanvasVisit(state, 'removed');
    expect(next.activityStays).toEqual({ unrelated: 'other-stay' });
  });

  it('removes a leaf visit without deleting its source record', () => {
    const state = fixture();
    const next = removeCanvasVisit(state, 'before');
    expect(next.order).toEqual(['removed', 'after']);
    expect(next.records).toEqual(state.records);
    expect(next.activityStays).toEqual(state.activityStays);
  });

  it('leaves unknown, unplaced and non-city records unchanged', () => {
    const source = fixture();
    const state = { ...source, records: [...source.records, record('unplaced')] };
    for (const id of ['unknown', 'unplaced', 'event'])
      expect(removeCanvasVisit(state, id)).toBe(state);
    const unplacedSection = {
      ...state,
      sections: [{ id: 'section', gapId: 'missing-gap', title: 'Unplaced', cards: ['unplaced'] }],
    };
    expect(removeCanvasVisit(unplacedSection, 'unplaced')).toBe(unplacedSection);
  });
});
