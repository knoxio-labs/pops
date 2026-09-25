import { aquariumType, gardenType, untypedItems } from '@/fixtures/inventory/type-arrived';
import { describe, expect, it } from 'vitest';

import { appliedMessage, applyLabel, matchesFor, tickReducer } from './type-arrived-model';

describe('matchesFor', () => {
  it('matches claimed labels ignoring case and spacing, in list order', () => {
    const ids = matchesFor(gardenType, untypedItems).map((entry) => entry.item.id);
    expect(ids).toEqual(['itm-pots', 'itm-hose', 'itm-secateurs', 'itm-can', 'itm-gloves']);
  });

  it('leaves out retired items and other labels', () => {
    const ids = matchesFor(gardenType, untypedItems).map((entry) => entry.item.id);
    expect(ids).not.toContain('itm-rake');
    expect(ids).not.toContain('itm-torch');
  });

  it('leaves out items that already have a type', () => {
    const typed = untypedItems.map((entry) => ({
      ...entry,
      item: { ...entry.item, typeId: 'type-tools' },
    }));
    expect(matchesFor(gardenType, typed)).toEqual([]);
  });

  it('matches nothing when no label is claimed', () => {
    expect(matchesFor(aquariumType, untypedItems)).toEqual([]);
  });
});

describe('tickReducer', () => {
  const start = new Set(['a', 'b']);

  it('toggles one id without touching the others', () => {
    expect([...tickReducer(start, { type: 'toggle', id: 'a' })]).toEqual(['b']);
    expect([...tickReducer(start, { type: 'toggle', id: 'c' })].toSorted()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not mutate the previous set', () => {
    tickReducer(start, { type: 'toggle', id: 'a' });
    expect(start.has('a')).toBe(true);
  });

  it('ticks all or none', () => {
    expect(tickReducer(start, { type: 'none' }).size).toBe(0);
    expect(tickReducer(new Set(), { type: 'all', ids: ['x', 'y'] }).size).toBe(2);
  });
});

describe('copy', () => {
  it('says how many Apply will type', () => {
    expect(applyLabel(0)).toBe('Apply');
    expect(applyLabel(4)).toBe('Apply to 4');
  });

  it('says what was typed, singular and plural', () => {
    expect(appliedMessage(1, 'Garden')).toBe('Typed 1 item as Garden');
    expect(appliedMessage(5, 'Garden')).toBe('Typed 5 items as Garden');
  });
});
