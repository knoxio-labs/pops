import { describe, expect, it } from 'vitest';

import { promotionFailures } from '../check-promotion.mjs';

const lanes = [
  'quality',
  'units',
  'apps',
  'rust',
  'frontend',
  'browser',
  'images',
  'registry',
  'ios',
];
const passed = () => Object.fromEntries(lanes.map((lane) => [lane, { result: 'success' }]));

describe('promotion validation', () => {
  it('admits ordinary PRs without a full sweep', () => {
    expect(promotionFailures(false, {})).toEqual([]);
  });
  it('requires all full lanes', () => {
    expect(promotionFailures(true, passed())).toEqual([]);
    expect(promotionFailures(true, {})).toEqual(lanes);
  });
  it.each(['failure', 'cancelled', 'skipped', 'pending', 'neutral', ''])(
    'rejects %s in every lane',
    (result) => {
      for (const lane of lanes) {
        expect(promotionFailures(true, { ...passed(), [lane]: { result } })).toEqual([lane]);
      }
    }
  );
});
