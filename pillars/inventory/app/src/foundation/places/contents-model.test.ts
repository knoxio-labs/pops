import { describe, expect, it } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { at, box, inBox, item } from '../test-fixtures/core-factory.js';
import { filterContents, isEmptyContents, placeContents } from './contents-model.js';

const locations = [
  { id: 'garage', name: 'Garage', parentId: null, kind: 'property' as const },
  { id: 'shelf', name: 'Shelf', parentId: 'garage', kind: 'storage' as const },
];

describe('place contents model', () => {
  it('puts boxes first and nested contents after their parent', () => {
    const contents = placeContents(
      buildWorld(
        [
          item(['lamp', 'Lamp', null], at('garage')),
          box(['outer', 'Outer box', 'box-type'], at('garage'), 'open'),
          item(['loose', 'Loose item', null], inBox('outer')),
          box(['inner', 'Inner box', 'box-type'], inBox('outer'), 'open'),
          item(['deep', 'Deep item', null], inBox('inner')),
          item(['retired', 'Retired', null], at('garage'), { lifecycle: 'retired' }),
        ],
        locations
      ),
      'garage'
    );
    expect(contents.here.map(({ id }) => id)).toEqual(['outer', 'lamp']);
    expect(contents.boxes.map(({ box, depth }) => `${box.id}:${depth}`)).toEqual([
      'outer:0',
      'inner:1',
    ]);
    expect(contents.boxedCount).toBe(3);
    expect(contents.places.map(({ id }) => id)).toEqual(['shelf']);
    expect(isEmptyContents(contents)).toBe(false);
  });

  it('matches item codes and keeps a matching box with all its contents', () => {
    const contents = placeContents(
      buildWorld(
        [
          box(['box', 'Moving box', 'box-type'], at('garage'), 'open'),
          item(['lamp', 'Desk lamp', null], inBox('box'), { code: 'L-17' }),
        ],
        locations
      ),
      'garage'
    );
    expect(filterContents(contents, 'l-17').boxes[0]?.contents.map(({ id }) => id)).toEqual([
      'lamp',
    ]);
    expect(filterContents(contents, 'moving').boxes[0]?.contents.map(({ id }) => id)).toEqual([
      'lamp',
    ]);
    expect(filterContents(contents, 'missing').boxes).toHaveLength(0);
  });

  it('keeps every ancestor when a deeply nested item matches', () => {
    const contents = placeContents(
      buildWorld(
        [
          box(['outer', 'Outer box', 'box-type'], at('garage'), 'open'),
          box(['inner', 'Inner box', 'box-type'], inBox('outer'), 'open'),
          box(['pouch', 'Small pouch', 'box-type'], inBox('inner'), 'open'),
          item(['screwdriver', 'Screwdriver', null], inBox('pouch')),
        ],
        locations
      ),
      'garage'
    );

    const filtered = filterContents(contents, 'screwdriver');

    expect(
      filtered.boxes.map(({ box: entry, depth, contents: groupContents }) => [
        entry.id,
        depth,
        groupContents.map(({ id }) => id),
      ])
    ).toEqual([
      ['outer', 0, ['inner']],
      ['inner', 1, ['pouch']],
      ['pouch', 2, ['screwdriver']],
    ]);
    expect(filtered.boxedCount).toBe(3);
  });

  it('can include inactive rows and recognizes a truly empty place', () => {
    const world = buildWorld(
      [item(['retired', 'Retired', null], at('garage'), { lifecycle: 'retired' })],
      locations
    );
    expect(placeContents(world, 'garage').here).toHaveLength(0);
    expect(placeContents(world, 'garage', true).here.map(({ id }) => id)).toEqual(['retired']);
    expect(isEmptyContents(placeContents(buildWorld([], []), 'garage'))).toBe(true);
  });
});
