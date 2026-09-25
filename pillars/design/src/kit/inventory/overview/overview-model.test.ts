import { coreLocations, coreWorld, item, inBox, at, box } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { buildWorld } from '../shared/placement-model';
import { movingProgress, openContainerRows, overviewCounts } from './overview-model';

describe('overviewCounts', () => {
  it('counts only active records, and things by quantity', () => {
    expect(overviewCounts(coreWorld)).toEqual({
      items: 34,
      things: 131,
      containers: 7,
      openContainers: 4,
      locations: 20,
      inHand: 5,
    });
  });

  it('is all zeros for an empty house', () => {
    expect(overviewCounts(buildWorld([], []))).toEqual({
      items: 0,
      things: 0,
      containers: 0,
      openContainers: 0,
      locations: 0,
      inHand: 0,
    });
  });
});

describe('openContainerRows', () => {
  it('lists active open containers, newest first, with what is directly inside', () => {
    const tub = box(['box-a', 'Tub A', 'type-tub'], at('loc-garage'), 'open', {
      updatedAt: '2026-09-20T00:00:00Z',
    });
    const crate = box(['box-b', 'Crate B', 'type-box'], at('loc-garage'), 'open', {
      updatedAt: '2026-09-24T00:00:00Z',
    });
    const inner = box(['box-c', 'Inner C', 'type-box'], inBox('box-a'), 'closed');
    const loose = item(['itm-a', 'Nail', null], inBox('box-c'));
    const retired = box(['box-d', 'Old D', 'type-box'], at('loc-garage'), 'open', {
      lifecycle: 'retired',
    });
    const world = buildWorld([tub, crate, inner, loose, retired], coreLocations);
    const rows = openContainerRows(world);
    expect(rows.map((row) => row.container.id)).toEqual(['box-b', 'box-a']);
    expect(rows.map((row) => row.directCount)).toEqual([0, 1]);
  });
});

describe('movingProgress', () => {
  it('counts closed boxes and everything packed in them, nested included', () => {
    expect(movingProgress(coreWorld)).toEqual({ closed: 3, total: 7, open: 4, full: 1, packed: 7 });
  });

  it('counts things inside a box nested in a closed box', () => {
    const outer = box(['box-o', 'Outer', 'type-box'], at('loc-garage'), 'closed');
    const inner = box(['box-i', 'Inner', 'type-box'], inBox('box-o'), 'open');
    const nail = item(['itm-n', 'Nail', null], inBox('box-i'));
    const world = buildWorld([outer, inner, nail], coreLocations);
    expect(movingProgress(world)).toEqual({ closed: 1, total: 2, open: 1, full: 0, packed: 2 });
  });

  it('is empty with no containers', () => {
    expect(movingProgress(buildWorld([], []))).toEqual({
      closed: 0,
      total: 0,
      open: 0,
      full: 0,
      packed: 0,
    });
  });
});
