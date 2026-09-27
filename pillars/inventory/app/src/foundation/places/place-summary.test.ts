import { describe, expect, it } from 'vitest';

import { placeSummary } from './place-summary.js';

describe('placeSummary', () => {
  it('states every non-empty part with singular and plural grammar', () => {
    expect(placeSummary({ places: 2, itemsHere: 1, boxesHere: 2, inBoxes: 5, total: 15 })).toBe(
      '2 places inside, 1 thing here, 2 boxes holding 5 things'
    );
  });

  it('calls boxes with no contents empty', () => {
    expect(placeSummary({ places: 0, itemsHere: 0, boxesHere: 1, inBoxes: 0, total: 0 })).toBe(
      '1 box, empty'
    );
  });

  it('uses Empty when every count is zero', () => {
    expect(placeSummary({ places: 0, itemsHere: 0, boxesHere: 0, inBoxes: 0, total: 0 })).toBe(
      'Empty'
    );
  });
});
