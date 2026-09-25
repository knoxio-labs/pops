import { coreWorld } from '@/fixtures/inventory/core';
import { describe, expect, it } from 'vitest';

import { placeSummary } from './place-summary';
import { tallyPlace } from './tree-model';

const blank = { places: 0, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 };

describe('placeSummary', () => {
  it('states every part with singular and plural', () => {
    expect(placeSummary(tallyPlace(coreWorld, 'loc-garage'))).toBe(
      '2 places inside, 1 thing here, 2 boxes holding 5 things'
    );
    expect(placeSummary({ ...blank, places: 1, itemsHere: 2, boxesHere: 1, inBoxes: 1 })).toBe(
      '1 place inside, 2 things here, 1 box holding 1 thing'
    );
  });

  it('says a box is empty rather than holding 0', () => {
    expect(placeSummary({ ...blank, boxesHere: 2 })).toBe('2 boxes, empty');
  });

  it('is Empty when there is nothing', () => {
    expect(placeSummary(blank)).toBe('Empty');
  });
});
