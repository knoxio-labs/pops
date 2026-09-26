import { coreWorld } from '@/fixtures/inventory/core';
import { at, box, inBox, inHand, item } from '@/fixtures/inventory/core-factory';
import { coreLocations } from '@/fixtures/inventory/core-locations';
import {
  MOVING_HOME_ID,
  movingDestinations,
  movingDoneWorld,
  movingNotStartedWorld,
  movingWorld,
} from '@/fixtures/inventory/moving-day';
import { describe, expect, it } from 'vitest';

import { buildWorld } from '../foundation';
import { findInBoxes, matchCount } from './find-in-boxes';
import {
  boxStage,
  boxesByDestination,
  boxesByStage,
  isMoveDone,
  packedPercent,
  roomOf,
  summariseMove,
} from './moving-model';

const summary = summariseMove(movingWorld, MOVING_HOME_ID, movingDestinations);

describe('boxStage', () => {
  it('reads open and not full as packing, open and full as full, closed as closed', () => {
    expect(boxStage(box(['a', 'A', 'type-box'], at('loc-kitchen'), 'open'))).toBe('packing');
    expect(boxStage(box(['b', 'B', 'type-box'], at('loc-kitchen'), 'open', { full: true }))).toBe(
      'full'
    );
    expect(boxStage(box(['c', 'C', 'type-box'], at('loc-kitchen'), 'closed'))).toBe('closed');
  });
});

describe('roomOf', () => {
  it('lifts a nested place to the room under the home', () => {
    expect(roomOf(coreWorld, 'loc-house', 'loc-toolbox')?.name).toBe('Garage');
    expect(roomOf(coreWorld, 'loc-house', 'loc-house')?.name).toBe('Wattle Street house');
    expect(roomOf(coreWorld, 'loc-house', 'loc-storage-bay')).toBeNull();
  });
});

describe('summariseMove', () => {
  it('counts boxes by stage and flags closed boxes without a label', () => {
    expect(summary.boxes).toHaveLength(16);
    expect(summary.stages).toEqual({ packing: 4, full: 2, closed: 10 });
    expect(summary.unlabelledClosed).toBe(2);
  });

  it('separates packed, loose by room and in hand', () => {
    expect(summary.packed).toBe(52);
    expect(summary.inHand.map((entry) => entry.name)).toEqual([
      'Tape measure',
      'Packing tape',
      'Marker pens',
    ]);
    expect(summary.loose.map((group) => [group.room.name, group.items.length])).toEqual([
      ['Living room', 5],
      ['Study', 3],
      ['Kitchen', 6],
      ['Main bedroom', 3],
      ['Hallway', 2],
      ['Garage', 3],
    ]);
    expect(summary.looseCount).toBe(22);
    expect(packedPercent(summary)).toBe(67);
  });

  it('leaves out inactive things and things outside the home', () => {
    const world = buildWorld(
      [
        item(['x', 'Gone', null], at('loc-kitchen'), { lifecycle: 'discarded' }),
        item(['y', 'Stored', null], at('loc-storage-bay')),
        box(['z', 'Box', 'type-box'], at('loc-kitchen'), 'open', { lifecycle: 'retired' }),
        item(['w', 'Inside retired', null], inBox('z')),
        item(['v', 'Held', null], inHand),
      ],
      coreLocations
    );
    const result = summariseMove(world, 'loc-house', new Map());
    expect(result.looseCount).toBe(0);
    expect(result.boxes).toEqual([]);
    expect(result.packed).toBe(1);
    expect(result.inHand).toHaveLength(1);
  });
});

describe('done and not started', () => {
  it('is done only when every box is closed and nothing is loose', () => {
    expect(isMoveDone(summary)).toBe(false);
    const done = summariseMove(movingDoneWorld, MOVING_HOME_ID, movingDestinations);
    expect(done.looseCount).toBe(0);
    expect(isMoveDone(done)).toBe(true);
    expect(packedPercent(done)).toBe(96);
  });

  it('is not done with no boxes at all, and 0% of nothing is 0', () => {
    const none = summariseMove(movingNotStartedWorld, MOVING_HOME_ID, new Map());
    expect(isMoveDone(none)).toBe(false);
    expect(packedPercent(none)).toBe(0);
    expect(packedPercent(summariseMove(buildWorld([], []), 'loc-house', new Map()))).toBe(0);
  });
});

describe('grouping', () => {
  it('keeps every stage in order, boxes in natural name order', () => {
    const groups = boxesByStage(summary.boxes);
    expect(groups.map((group) => group.stage)).toEqual(['packing', 'full', 'closed']);
    expect(groups[0]?.boxes.map((entry) => entry.box.name)).toEqual([
      'Garage 03',
      'Kitchen 04',
      'Living 03',
      'Study 03',
    ]);
  });

  it('groups by destination in tree order with the undecided last, counting arrivals', () => {
    const groups = boxesByDestination(movingWorld, summary.boxes);
    expect(groups.map((group) => [group.destination?.name ?? null, group.boxes.length])).toEqual([
      ['Offsite storage unit', 10],
      ["Parents' house", 5],
      [null, 1],
    ]);
    expect(groups[0]).toMatchObject({ closed: 6, arrived: 1 });
  });
});

describe('findInBoxes', () => {
  it('finds the box a thing is in', () => {
    const matches = findInBoxes(movingWorld, summary.boxes, 'mu');
    expect(matches.map((match) => match.summary.box.name)).toEqual(['Kitchen 02']);
    expect(matches[0]?.items.map((entry) => entry.name)).toEqual(['Mugs']);
  });

  it('ranks a name that starts with the query above one that contains it', () => {
    const world = buildWorld(
      [
        box(['a', 'Box A', 'type-box'], at('loc-kitchen'), 'open'),
        item(['a1', 'Mixing bowl', null], inBox('a')),
        box(['b', 'Box B', 'type-box'], at('loc-kitchen'), 'open'),
        item(['b1', 'Salad bowl', null], inBox('b')),
        item(['b2', 'Bowls', null], inBox('b')),
      ],
      coreLocations
    );
    const boxes = summariseMove(world, 'loc-house', new Map()).boxes;
    const matches = findInBoxes(world, boxes, 'bowl');
    expect(matches.map((match) => match.summary.box.name)).toEqual(['Box B', 'Box A']);
    expect(matches[0]?.items.map((entry) => entry.name)).toEqual(['Bowls', 'Salad bowl']);
  });

  it('puts a box whose own name or code matches first, with all its contents', () => {
    const matches = findInBoxes(movingWorld, summary.boxes, 'k02');
    expect(matches[0]).toMatchObject({ boxMatched: true });
    expect(matches[0]?.items).toHaveLength(3);
    expect(matchCount(matches)).toBe(3);
  });

  it('answers nothing for a blank query or a miss', () => {
    expect(findInBoxes(movingWorld, summary.boxes, '   ')).toEqual([]);
    expect(findInBoxes(movingWorld, summary.boxes, 'chandelier')).toEqual([]);
  });
});
