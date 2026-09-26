import { describe, expect, it } from 'vitest';

import { coreWorld } from '../fixtures/core';
import { at, box, inBox, item } from '../fixtures/core-factory';
import {
  buildWorld,
  deepContents,
  directContents,
  effectiveLocationId,
  isLocationWithin,
  isWithin,
  locationPath,
  placementTrail,
  previousTrail,
  samePlacement,
  targetName,
} from './placement-model';

import type { PathSegment } from './placement-model';

const names = (segments: readonly PathSegment[]): string[] =>
  segments.map((segment) => segment.name);

describe('placementTrail', () => {
  it('walks locations root first and then containers outermost first', () => {
    expect(names(placementTrail(coreWorld, inBox('box-parts')))).toEqual([
      'Wattle Street house',
      'Garage',
      'Shelving',
      'Cable tub',
      'Small parts case',
    ]);
  });

  it('starts at In hand for a carried container', () => {
    expect(names(placementTrail(coreWorld, inBox('box-bedside')))).toEqual([
      'In hand',
      'Bedside box',
    ]);
  });

  it('represents missing locations and containers without exposing their IDs as names', () => {
    expect(placementTrail(coreWorld, at('loc-gone'))).toEqual([
      { kind: 'missing', id: 'loc-gone', name: 'Unknown place' },
    ]);
    expect(placementTrail(coreWorld, inBox('box-gone'))).toEqual([
      { kind: 'missing', id: 'box-gone', name: 'Unknown container' },
    ]);
  });

  it('stops container cycles after including each container once', () => {
    const first = box(['a', 'A', 'type-box'], inBox('b'), 'open');
    const second = box(['b', 'B', 'type-box'], inBox('a'), 'open');

    expect(names(placementTrail(buildWorld([first, second], []), inBox('a')))).toEqual(['B', 'A']);
  });

  it('keeps only the remembered name of a deleted previous place', () => {
    expect(previousTrail(coreWorld, { kind: 'deleted', name: 'Spare room' })).toEqual([
      { kind: 'deleted', id: null, name: 'Spare room' },
    ]);
  });
});

describe('locationPath', () => {
  it('returns no path for an unknown location', () => {
    expect(locationPath(coreWorld, 'missing')).toEqual([]);
  });

  it('stops malformed parent cycles after including each location once', () => {
    const world = buildWorld(
      [],
      [
        { id: 'a', name: 'A', parentId: 'b', kind: 'room' },
        { id: 'b', name: 'B', parentId: 'a', kind: 'room' },
      ]
    );

    expect(locationPath(world, 'a').map((location) => location.id)).toEqual(['b', 'a']);
  });
});

describe('contents and containment', () => {
  it('sorts direct contents by name', () => {
    const world = buildWorld(
      [
        box(['container', 'Container', 'type-box'], at('place'), 'open'),
        item(['z', 'Zulu', null], inBox('container')),
        item(['a', 'Alpha', null], inBox('container')),
      ],
      []
    );

    expect(directContents(world, 'container').map((entry) => entry.id)).toEqual(['a', 'z']);
  });

  it('finds nested contents and effective locations', () => {
    expect(deepContents(coreWorld, 'box-cables').map((entry) => entry.id)).toEqual([
      'itm-charger',
      'box-parts',
      'itm-usbc',
    ]);
    expect(effectiveLocationId(coreWorld, 'itm-usbc')).toBe('loc-shelving');
    expect(effectiveLocationId(coreWorld, 'itm-sheets')).toBeNull();
  });

  it('returns null for a missing item or a broken placement chain', () => {
    const stranded = item(['stranded', 'Stranded', null], inBox('missing'));
    const world = buildWorld([stranded], []);

    expect(effectiveLocationId(world, 'missing')).toBeNull();
    expect(effectiveLocationId(world, 'stranded')).toBeNull();
  });

  it('recognises self, descendants, and unrelated containers', () => {
    expect(isWithin(coreWorld, 'box-parts', 'box-cables')).toBe(true);
    expect(isWithin(coreWorld, 'box-cables', 'box-cables')).toBe(true);
    expect(isWithin(coreWorld, 'box-k12', 'box-cables')).toBe(false);
  });

  it('recognises location descendants without reversing the relationship', () => {
    expect(isLocationWithin(coreWorld, 'loc-toolbox', 'loc-garage')).toBe(true);
    expect(isLocationWithin(coreWorld, 'loc-garage', 'loc-toolbox')).toBe(false);
    expect(isLocationWithin(coreWorld, 'missing', 'loc-garage')).toBe(false);
  });
});

describe('placement identity and labels', () => {
  it('compares every placement kind and rejects cross-kind matches', () => {
    expect(samePlacement(at('a'), at('a'))).toBe(true);
    expect(samePlacement(at('a'), at('b'))).toBe(false);
    expect(samePlacement(inBox('a'), inBox('a'))).toBe(true);
    expect(samePlacement(inBox('a'), inBox('b'))).toBe(false);
    expect(samePlacement({ kind: 'in-hand' }, { kind: 'in-hand' })).toBe(true);
    expect(samePlacement(at('a'), inBox('a'))).toBe(false);
  });

  it('names known targets and supplies stable missing-reference labels', () => {
    expect(targetName(coreWorld, at('loc-garage'))).toBe('Garage');
    expect(targetName(coreWorld, { kind: 'in-hand' })).toBe('In hand');
    expect(targetName(coreWorld, at('missing'))).toBe('Unknown place');
    expect(targetName(coreWorld, inBox('missing'))).toBe('Unknown container');
  });
});
