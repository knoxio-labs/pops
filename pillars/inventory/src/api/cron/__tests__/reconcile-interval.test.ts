import { describe, expect, it } from 'vitest';

import { RECONCILE_INTERVAL_ENV, resolveReconcileIntervalMs } from '../reconcile-interval.js';

describe('resolveReconcileIntervalMs', () => {
  it.each([undefined, '', '   '])('falls back to the worker default for %p', (raw) => {
    expect(resolveReconcileIntervalMs({ [RECONCILE_INTERVAL_ENV]: raw })).toBeUndefined();
  });

  it('reads a positive millisecond value', () => {
    expect(resolveReconcileIntervalMs({ [RECONCILE_INTERVAL_ENV]: '60000' })).toBe(60_000);
  });

  it.each(['1h', '0', '-1', 'NaN', 'Infinity'])('throws on the malformed value %p', (raw) => {
    expect(() => resolveReconcileIntervalMs({ [RECONCILE_INTERVAL_ENV]: raw })).toThrow(
      /positive number of milliseconds/u
    );
  });
});
