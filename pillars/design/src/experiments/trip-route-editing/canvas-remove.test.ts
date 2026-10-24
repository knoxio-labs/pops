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
      record('nested'),
      record('descendant'),
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
      record('nested-event', {
        kind: 'event',
        visitId: 'nested',
        schedule: { start: '2028-01-03' },
      }),
    ],
    parents: { nested: 'removed', descendant: 'nested' },
    itemOrders: { 'nested:removed': ['nested'], source: ['event', 'stay'] },
    activityStays: { event: 'stay' },
  };
}

describe('removeCanvasVisit', () => {
  it('replaces a root visit with visible children while preserving purchased and descendant facts', () => {
    const state = fixture();
    const original = structuredClone(state);
    const next = removeCanvasVisit(state, 'removed');
    expect(next.order).toEqual(['before', 'nested', 'event', 'stay', 'after']);
    expect(next.parents).toEqual({ descendant: 'nested' });
    expect(next.records.find((item) => item.id === 'removed')).toEqual(record('removed'));
    for (const id of ['event', 'stay']) {
      expect(next.records.find((item) => item.id === id)).toEqual({
        ...state.records.find((item) => item.id === id),
        visitId: undefined,
      });
    }
    expect(next.records.find((item) => item.id === 'nested-event')).toEqual(
      state.records.find((item) => item.id === 'nested-event')
    );
    expect(next.activityStays).toEqual({});
    expect(next.itemOrders.source).toEqual([]);
    expect(next.itemOrders['nested:removed']).toBeUndefined();
    expect(state).toEqual(original);
  });

  it('lifts nested cities into their parent order and reparents activities and stays together', () => {
    const source = fixture();
    const state: CanvasState = {
      ...source,
      order: ['before', 'after'],
      records: [...source.records, record('left'), record('right')],
      parents: { ...source.parents, removed: 'before', left: 'before', right: 'before' },
      itemOrders: { ...source.itemOrders, 'nested:before': ['left', 'removed', 'right'] },
    };
    const next = removeCanvasVisit(state, 'removed');
    expect(next.order).toEqual(['before', 'after']);
    expect(next.itemOrders['nested:before']).toEqual(['left', 'nested', 'right']);
    expect(next.parents).toEqual({
      nested: 'before',
      descendant: 'nested',
      left: 'before',
      right: 'before',
    });
    expect(next.records.find((item) => item.id === 'event')?.visitId).toBe('before');
    expect(next.records.find((item) => item.id === 'stay')?.visitId).toBe('before');
    expect(next.activityStays.event).toBe('stay');
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
    expect(next.sections[0]?.cards).toEqual(['before', 'nested', 'event', 'stay', 'after']);
    expect(next.records.find((item) => item.id === 'gap')?.optionIds).toEqual(
      next.sections[0]?.cards
    );
    expect(next.parents).toEqual({ descendant: 'nested' });
    expect(next.activityStays).toEqual({});
  });

  it('lifts each direct child once when it has duplicate placement edges', () => {
    const source = fixture();
    const state = { ...source, parents: { ...source.parents, event: 'removed' } };
    const next = removeCanvasVisit(state, 'removed');
    expect(next.order.filter((id) => id === 'event')).toEqual(['event']);
    expect(next.parents.event).toBeUndefined();
    expect(next.records.find((item) => item.id === 'event')?.visitId).toBeUndefined();
  });

  it('clears affected invalid assignments while preserving unrelated assignments', () => {
    const source = fixture();
    const state = {
      ...source,
      activityStays: { ...source.activityStays, 'nested-event': 'stay', unrelated: 'other-stay' },
    };
    const next = removeCanvasVisit(state, 'removed');
    expect(next.activityStays).toEqual({ unrelated: 'other-stay' });
  });

  it('removes a leaf visit without deleting its source record', () => {
    const state = fixture();
    const next = removeCanvasVisit(state, 'before');
    expect(next.order).toEqual(['removed', 'after']);
    expect(next.records).toEqual(state.records);
    expect(next.parents).toEqual(state.parents);
    expect(next.activityStays).toEqual(state.activityStays);
  });

  it('leaves unknown, unplaced and non-city records unchanged', () => {
    const source = fixture();
    const state = { ...source, records: [...source.records, record('unplaced')] };
    for (const id of ['unknown', 'unplaced', 'event'])
      expect(removeCanvasVisit(state, id)).toBe(state);
  });
});
