import { coreWorld } from '@/fixtures/inventory/core';
import { at, box, inBox, item } from '@/fixtures/inventory/core-factory';
import { describe, expect, it } from 'vitest';

import {
  buildWorld,
  deepContents,
  effectiveLocationId,
  isLocationWithin,
  isWithin,
  placementTrail,
  previousTrail,
  targetName,
} from './placement-model';

const names = (segments: { name: string }[]): string[] => segments.map((segment) => segment.name);

describe('placementTrail', () => {
  it('walks locations root first, then containers outermost first', () => {
    const trail = placementTrail(coreWorld, { kind: 'container', containerId: 'box-parts' });
    expect(names(trail)).toEqual([
      'Wattle Street house',
      'Garage',
      'Shelving',
      'Cable tub',
      'Small parts case',
    ]);
  });

  it('starts at In hand for a box being carried', () => {
    expect(
      names(placementTrail(coreWorld, { kind: 'container', containerId: 'box-bedside' }))
    ).toEqual(['In hand', 'Bedside box']);
  });

  it('names a missing place or container instead of rendering an id', () => {
    expect(names(placementTrail(coreWorld, { kind: 'location', locationId: 'loc-gone' }))).toEqual([
      'Unknown place',
    ]);
    expect(
      names(placementTrail(coreWorld, { kind: 'container', containerId: 'box-gone' }))
    ).toEqual(['Unknown container']);
  });

  it('stops on a container cycle rather than looping forever', () => {
    const a = box(['a', 'A', 'type-box'], inBox('b'), 'open');
    const b = box(['b', 'B', 'type-box'], inBox('a'), 'open');
    expect(
      placementTrail(buildWorld([a, b], []), { kind: 'container', containerId: 'a' }).length
    ).toBeLessThanOrEqual(32);
  });

  it('keeps only the name of a deleted previous place', () => {
    expect(previousTrail(coreWorld, { kind: 'deleted', name: 'Spare room' })).toEqual([
      { kind: 'deleted', id: null, name: 'Spare room' },
    ]);
  });
});

describe('containment', () => {
  it('finds nested contents and the effective location through them', () => {
    expect(deepContents(coreWorld, 'box-cables').map((entry) => entry.id)).toEqual([
      'itm-charger',
      'box-parts',
      'itm-usbc',
    ]);
    expect(effectiveLocationId(coreWorld, 'itm-usbc')).toBe('loc-shelving');
    expect(effectiveLocationId(coreWorld, 'itm-sheets')).toBeNull();
  });

  it('knows a container is within itself and its descendants, and not elsewhere', () => {
    expect(isWithin(coreWorld, 'box-parts', 'box-cables')).toBe(true);
    expect(isWithin(coreWorld, 'box-cables', 'box-cables')).toBe(true);
    expect(isWithin(coreWorld, 'box-k12', 'box-cables')).toBe(false);
  });

  it('knows a location is within an ancestor', () => {
    expect(isLocationWithin(coreWorld, 'loc-toolbox', 'loc-garage')).toBe(true);
    expect(isLocationWithin(coreWorld, 'loc-garage', 'loc-toolbox')).toBe(false);
  });

  it('names targets for buttons and toasts', () => {
    const world = buildWorld(
      [item(['x', 'X', null], at('l'))],
      [{ id: 'l', name: 'Loft', parentId: null, kind: 'room' }]
    );
    expect(targetName(world, { kind: 'location', locationId: 'l' })).toBe('Loft');
    expect(targetName(world, { kind: 'in-hand' })).toBe('In hand');
    expect(targetName(world, { kind: 'container', containerId: 'nope' })).toBe('Unknown container');
  });
});
