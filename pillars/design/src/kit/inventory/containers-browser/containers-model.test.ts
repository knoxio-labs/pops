import { coreInventory, coreItem, coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { holds, inSegment, movingOrder, packingProgress, segmentCounts } from './containers-model';

const ids = (segment: Parameters<typeof inSegment>[1]) =>
  coreInventory.filter((item) => inSegment(item, segment)).map((item) => item.id);

describe('segments', () => {
  it('never shows a non-container', () => {
    expect(inSegment(coreItem('itm-tv'), 'all')).toBe(false);
    expect(inSegment(coreItem('itm-camera'), 'retired')).toBe(false);
  });

  it('keeps retired containers out of every segment but Retired', () => {
    expect(ids('all')).not.toContain('box-shoe');
    expect(ids('open')).not.toContain('box-shoe');
    expect(ids('moving')).not.toContain('box-shoe');
    expect(ids('retired')).toEqual(['box-shoe']);
  });

  it('splits by access, and treats Full as a flag across both', () => {
    expect(ids('open')).toEqual(
      expect.arrayContaining(['box-k13', 'box-cables', 'box-parts', 'box-bedside'])
    );
    expect(ids('closed')).toEqual(expect.arrayContaining(['box-k12', 'box-o04', 'box-xmas']));
    expect(ids('full')).toEqual(['box-k12']);
    expect(ids('closed')).toContain('box-k12');
  });

  it('counts each segment', () => {
    expect(segmentCounts(coreInventory)).toEqual({
      all: 7,
      open: 4,
      closed: 3,
      full: 1,
      retired: 1,
      moving: 7,
    });
  });
});

describe('holdings and progress', () => {
  it('counts direct and nested contents', () => {
    expect(holds(coreWorld, 'box-cables')).toEqual({ direct: 2, deep: 3 });
    expect(holds(coreWorld, 'itm-tv')).toEqual({ direct: 0, deep: 0 });
  });

  it('reports packing progress over active containers only', () => {
    expect(packingProgress(coreWorld, coreInventory)).toEqual({
      closed: 3,
      fullButOpen: 0,
      open: 4,
      packedItems: 13,
    });
  });

  it('orders still-open before full before closed, then by name', () => {
    const fullOpen = { ...coreItem('box-k13'), container: { access: 'open' as const, full: true } };
    const order = [coreItem('box-k12'), fullOpen, coreItem('box-cables'), coreItem('box-o04')]
      .toSorted(movingOrder)
      .map((item) => item.id);
    expect(order).toEqual(['box-cables', 'box-k13', 'box-k12', 'box-o04']);
  });
});
