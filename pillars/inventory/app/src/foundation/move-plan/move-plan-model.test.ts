import { describe, expect, it } from 'vitest';

import { buildWorld } from '../model/placement-model';
import { at, box, inBox, inHand, item } from '../test-fixtures/core-factory';
import {
  affectedCount,
  dropVerdict,
  planIsApplicable,
  planMove,
  refusalText,
} from './move-plan-model';

import type { PlacementTarget } from '../model/model';

const locations = [
  { id: 'kitchen', name: 'Kitchen', parentId: null, kind: 'room' as const },
  { id: 'garage', name: 'Garage', parentId: null, kind: 'room' as const },
];
const outer = box(['outer', 'Outer box', 'type-box'], at('kitchen'), 'open');
const inner = box(['inner', 'Inner box', 'type-box'], inBox('outer'), 'open');
const mug = item(['mug', 'Mug', null], inBox('inner'));
const shut = box(['shut', 'Shut box', 'type-box'], at('garage'), 'closed');
const full = box(['full', 'Full box', 'type-box'], at('garage'), 'open', { full: true });
const retiredBox = box(['old', 'Old box', 'type-box'], at('garage'), 'open', {
  lifecycle: 'retired',
});
const binned = item(['binned', 'Binned lamp', null], at('kitchen'), { lifecycle: 'discarded' });
const lostHat = item(['hat', 'Hat', null], at('kitchen'), { lifecycle: 'lost' });
const ash = item(['ash', 'Burnt chair', null], at('kitchen'), { lifecycle: 'destroyed' });
const pen = item(['pen', 'Pen', null], at('garage'));
const held = item(['held', 'Tape', null], inHand);
const world = buildWorld(
  [outer, inner, mug, shut, full, retiredBox, binned, lostHat, ash, pen, held],
  locations
);

const garage: PlacementTarget = { kind: 'location', locationId: 'garage' };
const plan = (ids: string[], target: PlacementTarget): ReturnType<typeof planMove> =>
  planMove({ world, selectedIds: ids, target });

describe('planMove', () => {
  it('carries everything nested inside a moving container, once', () => {
    const result = plan(['outer', 'inner'], garage);

    expect(result.moving.map((entry) => entry.id)).toEqual(['outer', 'inner']);
    expect(result.carried.map((entry) => entry.id)).toEqual(['mug']);
    expect(affectedCount(result)).toBe(3);
  });

  it('separates rows already at the target from rows that move', () => {
    const result = plan(['pen', 'mug'], garage);

    expect(result.alreadyThere.map((entry) => entry.id)).toEqual(['pen']);
    expect(result.moving.map((entry) => entry.id)).toEqual(['mug']);
  });

  it('refuses a container into itself or its own contents', () => {
    expect(plan(['outer'], { kind: 'container', containerId: 'outer' }).blocked[0]?.reason).toBe(
      'Cannot go inside itself.'
    );
    const intoOwn = plan(['outer'], { kind: 'container', containerId: 'inner' });

    expect(intoOwn.blocked[0]?.reason).toBe('Inner box is inside Outer box.');
    expect(planIsApplicable(intoOwn)).toBe(false);
  });

  it('blocks discarded, lost and destroyed items and moves the rest', () => {
    const result = plan(['binned', 'hat', 'ash', 'mug'], garage);

    expect(result.moving.map((entry) => entry.id)).toEqual(['mug']);
    expect(result.blocked.map((blocker) => blocker.reason)).toEqual([
      'Discarded. Restore it first.',
      'Lost. Restore it first.',
      'Destroyed. It has no place any more.',
    ]);
    expect(planIsApplicable(result)).toBe(true);
  });

  it('refuses a closed, retired or missing target and says so', () => {
    const closed = plan(['pen'], { kind: 'container', containerId: 'shut' });

    expect(closed.targetRefusal).toBe('closed');
    expect(refusalText(closed)).toBe('Shut box is closed. Open it first.');
    expect(planIsApplicable(closed)).toBe(false);
    expect(plan(['pen'], { kind: 'container', containerId: 'old' }).targetRefusal).toBe('inactive');

    const gone = plan(['pen'], { kind: 'location', locationId: 'attic' });
    expect(gone.targetRefusal).toBe('missing');
    expect(gone.targetName).toBe('Unknown place');
  });

  it('warns about a full target without refusing it', () => {
    const result = plan(['pen'], { kind: 'container', containerId: 'full' });

    expect(result.targetFull).toBe(true);
    expect(planIsApplicable(result)).toBe(true);
  });

  it('moves to and from in hand like any other placement', () => {
    expect(plan(['held'], { kind: 'in-hand' }).alreadyThere).toHaveLength(1);
    expect(plan(['pen'], { kind: 'in-hand' }).moving).toHaveLength(1);
    expect(plan(['held'], garage).moving).toHaveLength(1);
  });

  it('ignores unknown and repeated ids', () => {
    expect(
      plan(['pen', 'pen', 'ghost'], { kind: 'location', locationId: 'kitchen' }).moving
    ).toHaveLength(1);
  });

  it('does not carry a selected nested item twice', () => {
    const result = plan(['outer', 'inner', 'mug'], garage);

    expect(result.carried).toHaveLength(0);
    expect(affectedCount(result)).toBe(3);
  });

  it('treats a non-container container target as missing', () => {
    const result = plan(['pen'], { kind: 'container', containerId: 'mug' });

    expect(result.targetRefusal).toBe('missing');
    expect(refusalText(result)).toBe('Mug no longer exists.');
  });
});

describe('dropVerdict', () => {
  it('accepts with the full carried count', () => {
    expect(dropVerdict(world, ['outer'], garage)).toEqual({ ok: true, count: 3 });
  });

  it('refuses with the target reason before any item reason', () => {
    expect(dropVerdict(world, ['binned'], { kind: 'container', containerId: 'shut' })).toEqual({
      ok: false,
      reason: 'Shut box is closed. Open it first.',
    });
  });

  it('refuses with the first blocker, then with Already in', () => {
    expect(dropVerdict(world, ['ash'], garage)).toEqual({
      ok: false,
      reason: 'Destroyed. It has no place any more.',
    });
    expect(dropVerdict(world, ['pen'], garage)).toEqual({
      ok: false,
      reason: 'Already in Garage.',
    });
  });

  it('accepts when at least one selected row can move', () => {
    expect(dropVerdict(world, ['ash', 'pen', 'mug'], garage)).toEqual({ ok: true, count: 1 });
  });
});
