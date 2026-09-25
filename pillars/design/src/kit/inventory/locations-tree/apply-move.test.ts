import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { planMove } from '../foundation';
import { applyMove } from './apply-move';

const shelving = { kind: 'location', locationId: 'loc-shelving' } as const;

describe('applyMove', () => {
  it('moves the selected items and remembers where each was', () => {
    const plan = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp', 'box-o04'],
      target: shelving,
    });
    const next = applyMove(coreWorld, plan);
    expect(next.items.get('itm-lamp')).toMatchObject({
      placement: shelving,
      previous: { kind: 'location', locationId: 'loc-desk' },
    });
    expect(next.items.get('box-o04')?.placement).toEqual(shelving);
  });

  it('leaves contents inside a moving box and everything else untouched', () => {
    const plan = planMove({ world: coreWorld, selectedIds: ['box-o04'], target: shelving });
    const next = applyMove(coreWorld, plan);
    expect(next.items.get('itm-monitor')?.placement).toEqual({
      kind: 'container',
      containerId: 'box-o04',
    });
    expect(next.items.get('itm-tv')).toBe(coreWorld.items.get('itm-tv'));
  });

  it('keeps an in-hand item’s remembered place rather than remembering In hand', () => {
    const plan = planMove({ world: coreWorld, selectedIds: ['itm-tape'], target: shelving });
    expect(applyMove(coreWorld, plan).items.get('itm-tape')?.previous).toEqual({
      kind: 'location',
      locationId: 'loc-toolbox',
    });
  });

  it('changes nothing for a refused target or a plan with nothing moving', () => {
    const closed = planMove({
      world: coreWorld,
      selectedIds: ['itm-lamp'],
      target: { kind: 'container', containerId: 'box-o04' },
    });
    expect(applyMove(coreWorld, closed)).toBe(coreWorld);
    const noop = planMove({ world: coreWorld, selectedIds: ['itm-pots'], target: shelving });
    expect(applyMove(coreWorld, noop)).toBe(coreWorld);
  });
});
