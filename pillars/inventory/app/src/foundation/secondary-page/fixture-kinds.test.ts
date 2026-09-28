import { describe, expect, it } from 'vitest';

import { FIXTURE_KIND_ORDER, fixtureKindLabel, fixtureKindOf } from './fixture-kinds.js';

describe('fixture kinds', () => {
  it('reads the six kind ids and nothing else', () => {
    expect(FIXTURE_KIND_ORDER).toEqual(['power', 'light', 'switch', 'network', 'antenna', 'water']);
    expect(FIXTURE_KIND_ORDER.map((kind) => fixtureKindOf(kind))).toEqual(FIXTURE_KIND_ORDER);
    expect(fixtureKindOf('Power')).toBeNull();
  });

  it('labels an unknown stored type as written', () => {
    expect(fixtureKindOf('Garden hose')).toBeNull();
    expect(fixtureKindLabel('Garden hose')).toBe('Garden hose');
  });
});
