import { describe, expect, it } from 'vitest';

import { activateAlternativePath } from './canvas-paths';
import { initialRouteCanvas } from './path-fixtures';

describe('complete alternative path move', () => {
  it('moves ordered city and transport identities, keeps linked bookings and competing paths unchanged', () => {
    const state = initialRouteCanvas('alternative-paths');
    const original = structuredClone(state);
    const section = state.sections[0];
    if (!section) throw new Error('Missing fixture path');
    expect(section.cards.length).toBeGreaterThan(2);
    const next = activateAlternativePath(state, section.id);
    const gap = next.order.indexOf(section.gapId);
    expect(next.order.slice(gap - section.cards.length, gap)).toEqual(section.cards);
    expect(new Set(next.order).size).toBe(next.order.length);
    expect(next.sections).toEqual(state.sections.slice(1));
    expect(next.appliedPaths).toEqual([section]);
    expect(next.records.filter((record) => record.kind !== 'gap')).toEqual(
      state.records.filter((record) => record.kind !== 'gap')
    );
    expect(next.transitLinks).toEqual(state.transitLinks);
    expect(state).toEqual(original);
    expect(activateAlternativePath(next, section.id)).toBe(next);
  });

  it('rejects duplicate placement and missing source identities atomically', () => {
    const state = initialRouteCanvas('alternative-paths');
    const section = state.sections[0];
    if (!section) throw new Error('Missing fixture path');
    const first = section.cards[0];
    if (!first) throw new Error('Missing fixture city');
    const duplicate = { ...state, order: [...state.order, first] };
    expect(activateAlternativePath(duplicate, section.id)).toBe(duplicate);
    const missing = {
      ...state,
      records: state.records.filter((record) => record.id !== section.cards[0]),
    };
    expect(activateAlternativePath(missing, section.id)).toBe(missing);
    const detached = { ...state, order: state.order.filter((id) => id !== section.gapId) };
    expect(activateAlternativePath(detached, section.id)).toBe(detached);
  });
});
