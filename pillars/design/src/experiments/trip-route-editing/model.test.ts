import { describe, expect, it } from 'vitest';

import { addVisit, choosePath, initialPlanner, moveVisit, updateVisit } from './model';

describe('route editing', () => {
  it('moves a visit without moving its event or purchase dates', () => {
    const state = initialPlanner('default');
    const moved = moveVisit(state, 'recife', -1);
    expect(moved.order.indexOf('recife')).toBe(state.order.indexOf('recife') - 1);
    expect(moved.records.filter((r) => r.kind !== 'gap')).toEqual(
      state.records.filter((r) => r.kind !== 'gap')
    );
    expect(moveVisit(state, state.order[0] ?? '', -1)).toBe(state);
    expect(moveVisit(state, 'missing', 1)).toBe(state);
    expect(moveVisit(state, state.order.at(-1) ?? '', 1)).toBe(state);
  });
  it('updates segment neighbours when a city crosses an open segment', () => {
    const state = moveVisit(initialPlanner('default'), 'recife', 1);
    expect(state.records.find((r) => r.id === 'open-january')?.timing).toEqual({
      afterVisitId: 'family',
      beforeVisitId: 'recife',
    });
  });
  it('adds repeated cities with separate visit identities', () => {
    const state = initialPlanner('default');
    const next = addVisit(state, 'curitiba', 'rio');
    const id = next.order[next.order.indexOf('rio') + 1];
    expect(id).not.toBe('curitiba');
    expect(next.records.find((r) => r.id === id)?.placeId).toBe('curitiba');
    expect(state.records.filter((r) => r.placeId === 'curitiba')).toHaveLength(3);
    expect(next.records).toHaveLength(state.records.length + 1);
  });
  it('inserts every repeated place as a new occurrence in root order', () => {
    const state = initialPlanner('default');
    const next = addVisit(state, 'recife', 'recife');
    const index = state.order.indexOf('recife');
    const id = next.order[index + 1];
    expect(id).toBeDefined();
    expect(state.records.some((record) => record.id === id)).toBe(false);
    expect(next.records.find((record) => record.id === id)).toMatchObject({
      kind: 'city',
      placeId: 'recife',
      timing: {},
    });
    expect(next.order).toEqual([
      ...state.order.slice(0, index + 1),
      id,
      ...state.order.slice(index + 1),
    ]);
    expect(next.records.filter((record) => record.purchase)).toEqual(
      state.records.filter((record) => record.purchase)
    );
    expect(state.order).not.toContain(id);
  });
  it('appends visits without an existing insertion anchor and avoids identity collisions', () => {
    const state = initialPlanner('empty');
    const occupied = {
      ...state,
      records: [
        {
          id: 'visit-2',
          kind: 'city' as const,
          placeId: 'recife',
          timing: {},
          intention: 'In plan' as const,
          arrangement: 'Not arranged' as const,
          notes: '',
        },
      ],
      order: ['visit-2'],
    };
    const next = addVisit(occupied, 'recife', 'missing');
    expect(next.order).toEqual(['visit-2', 'visit-3']);
    const appended = addVisit(next, 'recife');
    expect(appended.order).toEqual(['visit-2', 'visit-3', 'visit-4']);
    expect(new Set(appended.records.map((record) => record.id)).size).toBe(3);
    expect(addVisit(state, 'recife').order).toEqual(['visit-1']);
  });
  it('keeps outward and return cities in the root sequence', () => {
    const state = initialPlanner('flat-return');
    const index = state.order.indexOf('recife');
    const excursion = state.records.find((record) => record.id === state.order[index + 1]);
    const returned = state.records.find((record) => record.id === state.order[index + 2]);
    expect(excursion?.placeId).toBe('es');
    expect(returned?.placeId).toBe('recife-olinda');
    expect(excursion?.timing).toEqual({ arrival: '2028-01-06', departure: '2028-01-10' });
    expect(returned?.timing).toEqual({ arrival: '2028-01-10', departure: '2028-01-12' });
    expect(returned?.id).not.toBe('recife');
  });
  it('retains alternative records and rejects choices outside the segment', () => {
    const state = initialPlanner('default');
    const next = choosePath(state, 'open-january', 'minas');
    expect(next.choices['open-january']).toBe('minas');
    expect(next.records).toBe(state.records);
    expect(choosePath(state, 'open-january', 'rio')).toBe(state);
    expect(choosePath(state, 'missing', 'minas')).toBe(state);
    expect(choosePath(next, 'open-january', 'es').choices['open-january']).toBe('es');
  });
  it('changes only the edited visit and leaves purchases unchanged', () => {
    const state = initialPlanner('default');
    const city = state.records.find((r) => r.id === 'recife');
    if (!city) throw new Error('Missing fixture');
    const next = updateVisit(state, { ...city, timing: { departure: '2028-01-01' } });
    expect(next.records.find((r) => r.id === 'recife')?.timing?.departure).toBe('2028-01-01');
    expect(next.records.filter((r) => r.purchase)).toEqual(state.records.filter((r) => r.purchase));
    expect(state.records.find((r) => r.id === 'recife')?.timing?.departure).toBe('2028-01-06');
  });
  it('starts empty without stale alternatives or purchases', () => {
    expect(initialPlanner('empty')).toEqual({ records: [], order: [], choices: {} });
  });
});
