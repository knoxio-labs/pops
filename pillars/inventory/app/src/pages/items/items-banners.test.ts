import { describe, expect, it } from 'vitest';

import { at, item } from '../../foundation/fixtures/core-factory';
import { buildWorld } from '../../foundation/model/placement-model';
import { findDuplicatePair } from './items-banners';

describe('findDuplicatePair', () => {
  it('finds two same-named items in one place where only one has a code', () => {
    const rows = [
      item(['first', 'Extension lead', null], at('garage'), { code: 'EXT-1' }),
      item(['second', ' extension lead ', null], at('garage')),
    ];
    const world = buildWorld(rows, [
      { id: 'garage', name: 'Garage', parentId: null, kind: 'property' },
    ]);

    expect(findDuplicatePair(rows, world)).toEqual({
      name: 'Extension lead',
      place: 'Garage',
      ids: ['first', 'second'],
    });
  });

  it('ignores same names in different places and pairs where both or neither have a code', () => {
    const locations = [
      { id: 'garage', name: 'Garage', parentId: null, kind: 'property' },
      { id: 'study', name: 'Study', parentId: null, kind: 'property' },
    ] as const;

    const coded = [
      item(['coded-a', 'Extension lead', null], at('garage'), { code: 'EXT-1' }),
      item(['coded-b', 'Extension lead', null], at('garage'), { code: 'EXT-2' }),
    ];
    expect(findDuplicatePair(coded, buildWorld(coded, locations))).toBeNull();

    const uncoded = [
      item(['uncoded-a', 'Extension lead', null], at('garage')),
      item(['uncoded-b', 'Extension lead', null], at('garage')),
    ];
    expect(findDuplicatePair(uncoded, buildWorld(uncoded, locations))).toBeNull();

    const differentPlaces = [
      item(['garage-item', 'Extension lead', null], at('garage'), { code: 'EXT-1' }),
      item(['study-item', 'Extension lead', null], at('study')),
    ];
    expect(findDuplicatePair(differentPlaces, buildWorld(differentPlaces, locations))).toBeNull();
  });
});
