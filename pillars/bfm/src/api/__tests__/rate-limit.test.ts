import { describe, expect, it } from 'vitest';

import { createRateLimiter } from '../rate-limit.js';

describe('createRateLimiter', () => {
  it('allows exactly the budget, then refuses', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect([1, 2, 3].map(() => limiter.check('operator').allowed)).toEqual([true, true, true]);
    expect(limiter.check('operator').allowed).toBe(false);
  });

  it('reports whole seconds until the window rolls', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock });

    limiter.check('operator');
    clock += 20_000;

    expect(limiter.check('operator')).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  /** A `Retry-After: 0` reads as "retry now", which is exactly wrong. */
  it('never advises retrying in zero seconds', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock });

    limiter.check('operator');
    clock += 59_999;

    expect(limiter.check('operator').retryAfterSeconds).toBe(1);
  });

  it('budgets each key independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check('first').allowed).toBe(true);
    expect(limiter.check('second').allowed).toBe(true);
    expect(limiter.check('first').allowed).toBe(false);
  });

  it('restores the full budget once the window rolls', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => clock });

    limiter.check('operator');
    limiter.check('operator');
    expect(limiter.check('operator').allowed).toBe(false);

    clock += 60_000;

    expect(limiter.check('operator').allowed).toBe(true);
    expect(limiter.check('operator').allowed).toBe(true);
    expect(limiter.check('operator').allowed).toBe(false);
  });

  /**
   * A refused attempt must not extend the window. Otherwise a caller hammering
   * the endpoint keeps pushing its own reset out and locks itself out
   * indefinitely — and the map never drains.
   */
  it('does not extend the window on a refused attempt', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock });

    limiter.check('operator');
    for (let i = 0; i < 20; i += 1) {
      clock += 1_000;
      limiter.check('operator');
    }
    clock += 40_000;

    expect(limiter.check('operator').allowed).toBe(true);
  });

  /**
   * The key is caller-influenced on the device-facing routes (POPS-1374), so
   * an unbounded map would be a memory-exhaustion surface.
   */
  it('drops rolled-over windows instead of growing without bound', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => clock });

    for (let i = 0; i < 5_000; i += 1) {
      limiter.check(`caller-${i}`);
      clock += 1;
    }
    clock += 2_000;
    limiter.check('sweeper');

    // Every earlier window has rolled; only the sweeper's remains, which the
    // fresh budget below proves.
    expect(limiter.check('caller-0').allowed).toBe(true);
  });
});
