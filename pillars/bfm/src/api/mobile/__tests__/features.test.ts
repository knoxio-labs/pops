/**
 * The projection from federation health onto what the app renders.
 *
 * The property under test is that a feature is always reported. Silence would
 * be indistinguishable from a server that has never heard of the feature, and
 * the app has different words for those two situations.
 */
import { describe, expect, it } from 'vitest';

import { deriveFeatures, MOBILE_FEATURES } from '../features.js';

import type { BootstrapPillar } from '../../../contract/rest-schemas.js';

function pillars(...entries: BootstrapPillar[]): BootstrapPillar[] {
  return entries;
}

describe('deriving features from pillar reachability', () => {
  it('reports a feature as reachable as the pillar behind it', () => {
    const derived = deriveFeatures(pillars({ id: 'finance', reachability: 'healthy' }));

    expect(derived).toEqual([{ id: 'transactions', reachability: 'healthy' }]);
  });

  it.each(['degraded', 'unavailable', 'contract-mismatch'] as const)(
    'passes %s through rather than folding it into "absent"',
    (reachability) => {
      const derived = deriveFeatures(pillars({ id: 'finance', reachability }));

      expect(derived).toEqual([{ id: 'transactions', reachability }]);
    }
  );

  it('lists every known feature even when the federation reports nothing', () => {
    const derived = deriveFeatures([]);

    expect(derived.map((feature) => feature.id)).toEqual(
      MOBILE_FEATURES.map((feature) => feature.id)
    );
  });

  it('calls a feature whose pillar never registered unavailable', () => {
    const derived = deriveFeatures(pillars({ id: 'media', reachability: 'healthy' }));

    expect(derived).toEqual([{ id: 'transactions', reachability: 'unavailable' }]);
  });

  it('ignores pillars no feature is built on', () => {
    const derived = deriveFeatures(
      pillars(
        { id: 'media', reachability: 'contract-mismatch' },
        { id: 'finance', reachability: 'healthy' }
      )
    );

    expect(derived).toEqual([{ id: 'transactions', reachability: 'healthy' }]);
  });

  it('declares each feature exactly once, so no id can shadow another', () => {
    const ids = MOBILE_FEATURES.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
