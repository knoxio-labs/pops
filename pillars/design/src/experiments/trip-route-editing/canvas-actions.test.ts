import { describe, expect, it } from 'vitest';

import { captureCard, moveCard, renamePlace, reorderCards } from './canvas-actions';
import { canvasName, initialCanvas } from './canvas-model';

import type { CanvasState } from './canvas-model';

function withCities(): CanvasState {
  const first = captureCard(initialCanvas('empty'), 'city', 'First city', {});
  return captureCard(first, 'city', 'Second city', { after: first.order[0] });
}

function named(state: CanvasState, name: string): string {
  return state.records.find((record) => canvasName(state, record) === name)?.id ?? '';
}

describe('canvas capture and graph placement', () => {
  it('creates a real alternative gap in an empty route at the requested position', () => {
    const empty = initialCanvas('empty');
    const next = captureCard(empty, 'section', 'Either coast', {});
    expect(next.order).toHaveLength(1);
    expect(next.records.find((record) => record.id === next.order[0])?.kind).toBe('gap');
    expect(next.sections[0]).toMatchObject({
      title: 'Either coast',
      gapId: next.order[0],
      cards: [],
    });
    expect(next.sections[0]?.gapId).not.toBe('open-january');
    expect(empty.records).toEqual([]);
    const cities = withCities();
    const between = captureCard(cities, 'section', 'Detour', { after: cities.order[0] });
    expect(between.order[1]).toBe(between.sections[0]?.gapId);
    expect(between.order[2]).toBe(cities.order[1]);
  });

  it('reuses arbitrary places while recurring visits keep distinct identities', () => {
    const first = captureCard(initialCanvas('empty'), 'city', '  New place  ', {});
    const next = captureCard(first, 'city', 'new PLACE', {});
    expect(next.records).toHaveLength(2);
    expect(new Set(next.records.map((record) => record.id)).size).toBe(2);
    expect(new Set(next.records.map((record) => record.placeId)).size).toBe(1);
    expect(next.places).toHaveLength(first.places.length);
    const renamed = renamePlace(next, named(next, 'New place'), 'Another place');
    expect(renamed.places.some((place) => place.name === 'Another place')).toBe(true);
    expect(first.places.some((place) => place.name === 'Another place')).toBe(false);
  });

  it('captures standalone activities and period-bound stays without fabricating unknown dates', () => {
    let state = captureCard(initialCanvas('empty'), 'event', 'Independent event', {});
    state = captureCard(state, 'idea', 'Independent idea', {});
    const standaloneStay = captureCard(state, 'stay', 'Independent stay', {});
    expect(standaloneStay.order).toHaveLength(3);
    expect(standaloneStay.records.every((record) => standaloneStay.order.includes(record.id))).toBe(
      true
    );
    const cities = withCities();
    const next = captureCard(cities, 'stay', 'Hotel', {
      visitId: cities.order[0],
      start: '2028-01-01',
      end: '2028-01-05',
    });
    expect(next.records.find((record) => record.title === 'Hotel')).toMatchObject({
      visitId: cities.order[0],
      schedule: { start: '2028-01-01', end: '2028-01-05' },
    });
    expect(next.order).toEqual(cities.order);
  });

  it('records known transport and rental endpoints while leaving unknown endpoints and dates blank', () => {
    const cities = withCities();
    const transport = captureCard(cities, 'transport', 'Train', { after: cities.order[0] });
    const transitId = named(transport, 'Train');
    expect(transport.order[1]).toBe(transitId);
    expect(transport.transitLinks[transitId]).toEqual({
      from: cities.order[0],
      to: cities.order[1],
    });
    const rental = captureCard(cities, 'rental', 'Hire', { after: cities.order[0] });
    expect(rental.rentals[0]).toMatchObject({
      from: cities.order[0],
      to: cities.order[1],
      start: '',
      end: '',
    });
    const unknown = captureCard(initialCanvas('empty'), 'rental', 'Unplaced hire', {});
    expect(unknown.rentals[0]).toMatchObject({ from: '', to: '', start: '', end: '' });
  });

  it('moves multiple section cards to the root without duplicate membership or orphaned records', () => {
    let state = captureCard(withCities(), 'section', 'Alternatives', {});
    const sectionId = state.sections[0]?.id ?? '';
    state = captureCard(state, 'city', 'Third city', { sectionId });
    state = captureCard(state, 'city', 'Fourth city', { sectionId });
    expect(state.sections[0]?.cards).toHaveLength(2);
    const id = named(state, 'Third city');
    const next = moveCard(state, id, { after: named(state, 'First city') });
    expect(next.order.filter((key) => key === id)).toHaveLength(1);
    expect(next.sections[0]?.cards).not.toContain(id);
    expect(next.records.filter((record) => record.id === id)).toHaveLength(1);
    expect(
      next.records.find((record) => record.id === next.sections[0]?.gapId)?.optionIds
    ).not.toContain(id);
    expect(state.sections[0]?.cards).toContain(id);
  });

  it('moves sections across existing gaps and creates a gap when moved to the root', () => {
    let state = captureCard(withCities(), 'section', 'First option', {});
    state = captureCard(state, 'section', 'Second option', { after: named(state, 'Second city') });
    const first = state.sections[0];
    const second = state.sections[1];
    const together = moveCard(state, first?.id ?? '', { gapId: second?.gapId });
    expect(together.sections[0]?.gapId).toBe(second?.gapId);
    const rooted = moveCard(together, first?.id ?? '', { after: named(state, 'First city') });
    expect(rooted.sections[0]?.gapId).not.toBe(second?.gapId);
    expect(rooted.order[rooted.order.indexOf(named(state, 'First city')) + 1]).toBe(
      rooted.sections[0]?.gapId
    );
    expect(rooted.sections).toHaveLength(2);
  });

  it('moves nested visits back to the route and rejects self-drops and ancestry cycles', () => {
    const state = withCities();
    const first = named(state, 'First city');
    const second = named(state, 'Second city');
    const nested = moveCard(state, second, { visitId: first });
    expect(nested.order).not.toContain(second);
    expect(nested.parents[second]).toBe(first);
    expect(moveCard(nested, first, { visitId: second })).toBe(nested);
    expect(moveCard(nested, second, { visitId: second })).toBe(nested);
    expect(moveCard(nested, first, { after: first })).toBe(nested);
    const rooted = moveCard(nested, second, {});
    expect(rooted.parents[second]).toBeUndefined();
    expect(rooted.order[0]).toBe(second);
    expect(rooted.records).toEqual(state.records);
  });

  it('retains purchased arrangement facts and independent names when moving and relocating cards', () => {
    const base = withCities();
    const captured = captureCard(base, 'stay', 'Purchased hotel', {
      visitId: base.order[0],
      start: '2028-01-01',
      end: '2028-01-05',
    });
    const id = named(captured, 'Purchased hotel');
    const state: CanvasState = {
      ...captured,
      records: captured.records.map((record) =>
        record.id === id ? { ...record, purchase: 'Purchased', arrangement: 'Booked' } : record
      ),
    };
    const source = structuredClone(state);
    const root = moveCard(state, id, {});
    const original = source.records.find((record) => record.id === id);
    expect(root.records.find((record) => record.id === id)).toEqual({
      ...original,
      visitId: undefined,
    });
    const renamed = renamePlace(root, id, 'Different city');
    expect(renamed.records.find((record) => record.id === id)).toMatchObject({
      title: 'Purchased hotel',
      purchase: 'Purchased',
      arrangement: 'Booked',
      schedule: original?.schedule,
    });
    expect(state.records.find((record) => record.id === id)?.visitId).toBe(base.order[0]);
    expect(state).toEqual(source);
  });

  it('rejects unknown destinations without changing state or creating invisible records', () => {
    const state = withCities();
    for (const target of [
      { after: 'missing' },
      { visitId: 'missing' },
      { sectionId: 'missing' },
      { gapId: 'missing' },
    ]) {
      expect(captureCard(state, 'city', 'Lost city', target)).toBe(state);
      expect(moveCard(state, named(state, 'First city'), target)).toBe(state);
    }
    expect(captureCard(state, 'city', ' ', {})).toBe(state);
    expect(renamePlace(state, 'missing', 'Unused place')).toBe(state);
    expect(moveCard(state, 'missing', {})).toBe(state);
  });

  it('accepts only complete reorder memberships and does not alias caller arrays', () => {
    const state = withCities();
    for (const ids of [
      [],
      [state.order[0] ?? ''],
      [...state.order, 'missing'],
      [state.order[0] ?? '', state.order[0] ?? ''],
    ])
      expect(reorderCards(state, ids)).toBe(state);
    expect(reorderCards(state, ['invented'], 'unknown')).toBe(state);
    const order = state.order.toReversed();
    const next = reorderCards(state, order);
    expect(next.order).toEqual(order);
    order.pop();
    expect(next.order).toHaveLength(2);
    const ordered: CanvasState = { ...state, itemOrders: { activities: ['a', 'b'] } };
    expect(reorderCards(ordered, ['b', 'a'], 'activities').itemOrders.activities).toEqual([
      'b',
      'a',
    ]);
    expect(reorderCards(ordered, ['b'], 'activities')).toBe(ordered);
  });

  it('assigns and explicitly clears activity accommodation atomically without rewriting dates', () => {
    const cities = withCities();
    const withStay = captureCard(cities, 'stay', 'Hotel', {
      visitId: cities.order[0],
      start: '2028-01-01',
      end: '2028-01-03',
    });
    const state = captureCard(withStay, 'event', 'Late event', {
      visitId: cities.order[1],
      start: '2028-01-05',
    });
    const id = named(state, 'Late event');
    const stayId = named(state, 'Hotel');
    const assigned = moveCard(state, id, { visitId: cities.order[0], stayId });
    expect(assigned.activityStays[id]).toBe(stayId);
    expect(assigned.records.find((record) => record.id === id)?.schedule).toEqual({
      start: '2028-01-05',
      end: undefined,
    });
    const cleared = moveCard(assigned, id, { visitId: cities.order[0], stayId: '' });
    expect(cleared.activityStays[id]).toBe('');
    expect(moveCard(state, id, { visitId: cities.order[1], stayId })).toBe(state);
    expect(moveCard(state, id, { visitId: cities.order[0], stayId: 'missing' })).toBe(state);
  });

  it('rejects unplaced source destinations and avoids identity collisions', () => {
    const base = withCities();
    const removedId = named(base, 'Second city');
    const state: CanvasState = { ...base, order: base.order.filter((id) => id !== removedId) };
    expect(captureCard(state, 'idea', 'Lost event', { visitId: removedId })).toBe(state);
    expect(moveCard(state, named(state, 'First city'), { visitId: removedId })).toBe(state);
    const extra = captureCard(state, 'city', 'New city', {});
    expect(new Set(extra.records.map((record) => record.id)).size).toBe(extra.records.length);
    const section = captureCard(base, 'section', 'Option', {});
    expect(
      moveCard(section, section.sections[0]?.id ?? '', { sectionId: section.sections[0]?.id })
    ).toBe(section);
  });

  it('keeps initial fixture additions independent across state instances', () => {
    const first = initialCanvas('default');
    const second = initialCanvas('default');
    const dinner = first.records.find((record) => record.id === 'dinner');
    if (dinner) dinner.notes = 'Changed locally';
    if (first.rentals[0]) first.rentals[0].provider = 'Changed locally';
    expect(second.records.find((record) => record.id === 'dinner')?.notes).toBe('');
    expect(second.rentals[0]?.provider).toBe('Rental car');
    expect(second.clockOverrides).toEqual({});
    expect(second.buffers).toEqual({});
  });
});
