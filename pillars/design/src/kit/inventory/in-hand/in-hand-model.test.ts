import {
  headphones,
  inHandItems,
  screwdrivers,
  tapeMeasure,
  torch,
} from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { orderInHand, planPutBackAll, returnRoute } from './in-hand-model';

describe('returnRoute', () => {
  it('goes back to a remembered location or container', () => {
    expect(returnRoute(tapeMeasure)).toEqual({
      kind: 'back',
      to: { kind: 'location', locationId: 'loc-toolbox' },
    });
    expect(returnRoute(screwdrivers)).toEqual({
      kind: 'back',
      to: { kind: 'container', containerId: 'box-cables' },
    });
  });

  it('keeps the name of a deleted place', () => {
    expect(returnRoute(headphones)).toEqual({ kind: 'deleted', name: 'Spare room' });
  });

  it('has nowhere to go for an item that never had a place', () => {
    expect(returnRoute(torch)).toEqual({ kind: 'none' });
  });
});

describe('planPutBackAll', () => {
  it('puts back all when every item can go back', () => {
    const plan = planPutBackAll([tapeMeasure, screwdrivers]);
    expect(plan.label).toBe('Put back all');
    expect(plan.disabledReason).toBeNull();
    expect(plan.stranded).toEqual([]);
  });

  it('counts what it can do when some items cannot go back', () => {
    const plan = planPutBackAll(inHandItems);
    expect(plan.returnable.map((item) => item.id)).toEqual([
      'box-bedside',
      'itm-tape',
      'itm-screw',
    ]);
    expect(plan.stranded.map((item) => item.id)).toEqual(['itm-headphones', 'itm-torch']);
    expect(plan.label).toBe('Put back 3 of 5');
    expect(plan.disabledReason).toBeNull();
  });

  it('is disabled with a named reason when one item cannot go back', () => {
    const plan = planPutBackAll([torch]);
    expect(plan.disabledReason).toBe('Torch has no place to go back to');
  });

  it('is disabled with a count when several cannot go back', () => {
    expect(planPutBackAll([torch, headphones]).disabledReason).toBe(
      '2 items have no place to go back to'
    );
  });

  it('is disabled when nothing is in hand', () => {
    expect(planPutBackAll([]).disabledReason).toBe('Nothing is in hand');
  });
});

describe('orderInHand', () => {
  it('puts items that need a place first, keeping order within each part', () => {
    expect(orderInHand(inHandItems).map((item) => item.id)).toEqual([
      'itm-headphones',
      'itm-torch',
      'box-bedside',
      'itm-tape',
      'itm-screw',
    ]);
  });

  it('leaves a list with nothing stranded as it was', () => {
    expect(orderInHand([screwdrivers, tapeMeasure])).toEqual([screwdrivers, tapeMeasure]);
  });
});
