import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { filterContents, isEmptyContents, placeContents } from './contents-model';

const names = (entries: readonly { name: string }[]): string[] => entries.map((e) => e.name);

describe('placeContents', () => {
  it('lists places inside, then boxes before loose things', () => {
    const garage = placeContents(coreWorld, 'loc-garage');
    expect(names(garage.places)).toEqual(['Workbench', 'Shelving']);
    expect(names(garage.here)).toEqual(['Kitchen 12', 'Office 04', 'Step ladder']);
  });

  it('groups what is in each box, nested boxes after their parent with depth', () => {
    const shelving = placeContents(coreWorld, 'loc-shelving');
    expect(
      shelving.boxes.map((group) => [group.box.name, group.depth, names(group.contents)])
    ).toEqual([
      ['Cable tub', 0, ['Small parts case', 'Laptop charger']],
      ['Small parts case', 1, ['USB-C cable 1 m']],
    ]);
    expect(shelving.boxedCount).toBe(3);
  });

  it('leaves inactive things out unless asked', () => {
    expect(names(placeContents(coreWorld, 'loc-living').here)).toEqual(['Television']);
    expect(names(placeContents(coreWorld, 'loc-living', true).here)).toEqual([
      'Bluetooth speaker',
      'Television',
    ]);
    expect(placeContents(coreWorld, 'loc-wardrobe').boxes).toEqual([]);
  });

  it('is empty for a place with nothing and no sub-places', () => {
    expect(isEmptyContents(placeContents(coreWorld, 'loc-storage-bay'))).toBe(false);
    expect(isEmptyContents(placeContents(coreWorld, 'loc-hall-cupboard'))).toBe(false);
    expect(isEmptyContents(placeContents(coreWorld, 'loc-nowhere'))).toBe(true);
  });
});

describe('filterContents', () => {
  const garage = placeContents(coreWorld, 'loc-garage');

  it('narrows every list by name or code', () => {
    const result = filterContents(garage, 'mug');
    expect(result.here).toEqual([]);
    expect(result.boxes.map((group) => [group.box.name, names(group.contents)])).toEqual([
      ['Kitchen 12', ['Mugs']],
    ]);
    expect(result.boxedCount).toBe(1);
    expect(names(filterContents(garage, 'm27').boxes[0]?.contents ?? [])).toEqual([
      'Monitor 27 in',
    ]);
  });

  it('keeps a whole box when its own name or code matches', () => {
    const result = filterContents(garage, 'O04');
    expect(names(result.here)).toEqual(['Office 04']);
    expect(names(result.boxes[0]?.contents ?? [])).toEqual(['Keyboard', 'Monitor 27 in']);
  });

  it('returns the same lists for a blank query and nothing for a miss', () => {
    expect(filterContents(garage, '  ')).toBe(garage);
    const miss = filterContents(garage, 'chandelier');
    expect([miss.places, miss.here, miss.boxes]).toEqual([[], [], []]);
    expect(names(filterContents(garage, 'shelv').places)).toEqual(['Shelving']);
  });
});
