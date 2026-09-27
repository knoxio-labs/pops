import { describe, expect, it } from 'vitest';

import { findInBoxes, matchCount } from './moving-day-search.js';
import { box, thing } from './moving-day-test-fixtures.js';

describe('moving-day-search', () => {
  const boxes = [
    box('box-kitchen', 'Kitchen 01', 'packing', {
      code: 'K-01',
      contents: [
        thing('kettle', 'Electric kettle', 'box-kitchen'),
        thing('plates', 'Dinner plates', 'box-kitchen'),
      ],
      count: 2,
    }),
    box('box-tools', 'Tools', 'closed', {
      contents: [thing('hammer', 'Hammer', 'box-tools')],
      count: 1,
    }),
  ];

  it('returns every box content when the box name or code matches', () => {
    const matches = findInBoxes(boxes, 'k-01');

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      box: boxes[0],
      boxMatched: true,
      items: boxes[0]!.contents,
      rank: -1,
    });
  });

  it('ranks prefix content matches before substring matches and sorts contents', () => {
    const matches = findInBoxes(
      [
        box('box-a', 'A', 'packing', {
          contents: [
            thing('substring', 'A plate stand', 'box-a'),
            thing('prefix', 'Plates', 'box-a'),
          ],
          count: 2,
        }),
      ],
      'plate'
    );

    expect(matches[0]?.boxMatched).toBe(false);
    expect(matches[0]?.items.map((item) => item.name)).toEqual(['Plates', 'A plate stand']);
    expect(matchCount(matches)).toBe(2);
  });

  it('trims queries and returns no result for blank or missing matches', () => {
    expect(findInBoxes(boxes, '   ')).toEqual([]);
    expect(findInBoxes(boxes, 'microwave')).toEqual([]);
  });

  it('matches a code on an item, not just its display name', () => {
    const matches = findInBoxes(
      [
        box('box', 'Office', 'closed', {
          contents: [thing('printer', 'Printer', 'box', { code: 'PR-7' })],
          count: 1,
        }),
      ],
      'pr-7'
    );

    expect(matches[0]?.items.map((item) => item.id)).toEqual(['printer']);
  });
});
