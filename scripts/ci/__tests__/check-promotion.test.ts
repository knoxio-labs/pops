import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkPromotionEnvironment, promotionFailures } from '../check-promotion.mjs';

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

describe('promotion workflow input contract', () => {
  it.each([undefined, '', 'TRUE', 'yes'])('rejects invalid admission flag %s', (flag) => {
    expect(() => checkPromotionEnvironment(flag, JSON.stringify(passed()))).toThrow();
  });
  it.each([undefined, '', '{', 'null', '[]', 'true', '{"ios":null}', '{"ios":{}}'])(
    'rejects malformed results %s',
    (results) => {
      expect(() => checkPromotionEnvironment('true', results)).toThrow();
    }
  );
  it('distinguishes valid ordinary and full runs', () => {
    expect(checkPromotionEnvironment('false', '{}')).toEqual([]);
    expect(checkPromotionEnvironment('true', '{}')).toEqual(lanes);
    expect(checkPromotionEnvironment('true', JSON.stringify(passed()))).toEqual([]);
  });
});

it.each([
  {},
  { PROMOTION_REQUIRED: 'invalid', PROMOTION_RESULTS: '{}' },
  { PROMOTION_REQUIRED: 'true', PROMOTION_RESULTS: 'null' },
  { PROMOTION_REQUIRED: 'true', PROMOTION_RESULTS: '{}' },
])(
  'the CLI exits nonzero for invalid or incomplete admission: %j',
  (env) => {
    const run = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../check-promotion.mjs')],
      {
        env,
        encoding: 'utf8',
        timeout: 10_000,
      }
    );
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(1);
  },
  30_000
);
