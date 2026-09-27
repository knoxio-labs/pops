import { describe, expect, it } from 'vitest';

import {
  boxesByDestination,
  boxesByStage,
  containerFactsForBox,
  isMoveDone,
  looseGroupForBox,
  movingItemIds,
  movingPlacementTarget,
  packedPercent,
  staleDetail,
  staleTitle,
} from './moving-day-model.js';
import { box, movingData, worldForMovingData } from './moving-day-test-fixtures.js';

import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';

describe('moving-day-model', () => {
  it('keeps empty stage columns and natural-sorts their boxes', () => {
    const groups = boxesByStage([
      box('box-10', 'Box 10', 'packing'),
      box('box-2', 'Box 2', 'packing'),
    ]);

    expect(groups.map((group) => [group.stage, group.boxes.map((entry) => entry.name)])).toEqual([
      ['packing', ['Box 2', 'Box 10']],
      ['full', []],
      ['closed', []],
    ]);
  });

  it('orders destination groups, includes configured empties, and keeps undecided boxes visible', () => {
    const data = movingData({
      boxes: [
        box('unknown', 'Unknown', 'closed', {
          destination: { optionKey: 'new-place', label: 'New place' },
        }),
        box('undecided', 'Undecided', 'packing'),
      ],
    });

    expect(boxesByDestination(data).map((group) => [group.label, group.boxes.length])).toEqual([
      ['Storage unit', 0],
      ['Parents', 0],
      ['New place', 1],
      ['No destination', 1],
    ]);
  });

  it('calculates progress, completion, item IDs, and stage facts from the response', () => {
    const data = movingData();

    expect(packedPercent(data)).toBe(50);
    expect(isMoveDone(data)).toBe(false);
    expect(movingItemIds(data)).toEqual([
      'box-2',
      'item-kettle',
      'box-10',
      'item-lamp',
      'box-1',
      'item-books',
      'item-plant',
      'item-mug',
      'item-phone',
    ]);
    expect(containerFactsForBox(data.boxes[1]!)).toEqual({ access: 'open', full: true });

    const done = movingData({
      loose: [],
      looseCount: 0,
      inHand: [],
      stages: { packing: 0, full: 0, closed: 1 },
      boxes: [box('closed', 'Closed', 'closed')],
    });
    expect(isMoveDone(done)).toBe(true);
  });

  it('maps every API placement variant into the shared target model', () => {
    expect(movingPlacementTarget({ kind: 'location', locationId: 'kitchen' })).toEqual({
      kind: 'location',
      locationId: 'kitchen',
    });
    expect(movingPlacementTarget({ kind: 'container', itemId: 'outer' })).toEqual({
      kind: 'container',
      containerId: 'outer',
    });
    expect(movingPlacementTarget({ kind: 'hand' })).toEqual({ kind: 'in-hand' });
  });

  it('finds the loose room for a box through the location tree', () => {
    const data = movingData();
    const world = worldForMovingData(data);

    expect(looseGroupForBox(data, world, data.boxes[0]!)).toEqual(data.loose[0]);
    expect(looseGroupForBox(data, world, { ...data.boxes[0]!, placement: { kind: 'hand' } })).toBe(
      null
    );
  });

  it('formats stale changes for one and multiple sources', () => {
    const change = (
      actorLabel: string,
      actorKind: WebChangeGroup['actorKind'],
      entityCount: number
    ): WebChangeGroup => ({
      actorId: null,
      actorKind,
      actorLabel,
      entityCount,
      eventCount: entityCount,
      kindCounts: {},
      latestServerTime: '',
    });
    const one = [change('iPhone', 'device', 1)];
    const two = [change('iPhone', 'device', 1), change('Web', 'service', 2)];

    expect(staleTitle(one)).toBe('iPhone changed the move.');
    expect(staleDetail(one)).toBe('1 thing changed. Reload to see them.');
    expect(staleTitle(two)).toBe('The move changed elsewhere.');
    expect(staleDetail(two)).toBe('3 things changed. Reload to see them.');
  });
});
