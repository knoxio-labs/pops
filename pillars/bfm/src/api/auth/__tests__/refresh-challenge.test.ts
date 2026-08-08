/**
 * The nonce store, against the three properties the refresh design rests on:
 * a nonce is unguessable, it is spendable once, and the map holding them
 * cannot be grown without bound by whoever can reach the route.
 *
 * Every test drives an injected clock. Sleeping through a real TTL would make
 * this suite a minute long and would still not prove the boundary — a fake
 * clock can sit exactly on it.
 */
import { describe, expect, it } from 'vitest';

import {
  CHALLENGE_NONCE_BYTES,
  CHALLENGE_TTL_MS,
  createRefreshChallengeStore,
  DEFAULT_MAX_LIVE_CHALLENGES,
  generateChallengeNonce,
} from '../refresh-challenge.js';
import { REFRESH_RATE_LIMIT_WINDOW_MS } from '../refresh-rate-limit.js';

/** A clock a test moves by hand. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

describe('generateChallengeNonce', () => {
  it('draws the full declared width', () => {
    expect(Buffer.from(generateChallengeNonce(), 'base64url')).toHaveLength(CHALLENGE_NONCE_BYTES);
  });

  it('is URL- and header-safe, so no encoding hop can alter it in transit', () => {
    for (let i = 0; i < 64; i += 1) {
      expect(generateChallengeNonce()).toMatch(/^[A-Za-z0-9_-]+$/u);
    }
  });

  it('never repeats across a run', () => {
    const drawn = new Set(Array.from({ length: 512 }, () => generateChallengeNonce()));

    expect(drawn.size).toBe(512);
  });
});

describe('createRefreshChallengeStore', () => {
  it('issues a nonce that can be spent once', () => {
    const store = createRefreshChallengeStore();
    const { nonce } = store.issue();

    expect(store.consume(nonce)).toBe(true);
    expect(store.consume(nonce)).toBe(false);
  });

  it('refuses a nonce it never issued', () => {
    const store = createRefreshChallengeStore();
    store.issue();

    expect(store.consume('not-a-nonce-this-store-drew')).toBe(false);
  });

  it('refuses one that has expired', () => {
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, now: clock.now });
    const { nonce } = store.issue();

    clock.advance(60_001);

    expect(store.consume(nonce)).toBe(false);
  });

  it('still honours one at the last millisecond of its life', () => {
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, now: clock.now });
    const { nonce } = store.issue();

    clock.advance(59_999);

    expect(store.consume(nonce)).toBe(true);
  });

  it('forgets an expired nonce it was asked about, rather than keeping the slot', () => {
    // Single use has to mean single *presentation*. A nonce left in the map
    // after a failed attempt is a slot an attacker can keep probing, and one
    // an eviction would have to walk past.
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, now: clock.now });
    const { nonce } = store.issue();
    clock.advance(60_001);

    expect(store.consume(nonce)).toBe(false);

    expect(store.size()).toBe(0);
  });

  it('spends the nonce presented and no other', () => {
    const store = createRefreshChallengeStore();
    const mine = store.issue();
    const theirs = store.issue();

    expect(store.consume(mine.nonce)).toBe(true);

    expect(store.consume(theirs.nonce)).toBe(true);
  });

  it('reports a shelf life the phone can act on', () => {
    expect(createRefreshChallengeStore({ ttlMs: 60_000 }).issue().expiresInSeconds).toBe(60);
  });

  it('never reports a challenge as already dead on arrival', () => {
    // The contract promises a positive integer. A sub-second TTL truncating to
    // zero would describe a nonce nobody could use.
    expect(createRefreshChallengeStore({ ttlMs: 1 }).issue().expiresInSeconds).toBe(1);
  });

  it('drops expired entries as new ones arrive, without being asked', () => {
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, now: clock.now });
    for (let i = 0; i < 10; i += 1) store.issue();
    expect(store.size()).toBe(10);

    clock.advance(60_001);
    store.issue();

    // Nothing consumed them; a store that only pruned on `consume` would still
    // be holding all ten, which is the shape of an unbounded map.
    expect(store.size()).toBe(1);
  });

  it('keeps live entries while pruning the expired ones around them', () => {
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, now: clock.now });
    const stale = store.issue();
    clock.advance(59_000);
    const fresh = store.issue();

    clock.advance(1_001);
    store.issue();

    expect(store.consume(stale.nonce)).toBe(false);
    expect(store.consume(fresh.nonce)).toBe(true);
  });

  it('never exceeds its ceiling, however many are issued inside one TTL', () => {
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, maxLive: 4, now: clock.now });

    for (let i = 0; i < 50; i += 1) store.issue();

    expect(store.size()).toBe(4);
  });

  it('evicts the oldest live entry rather than refusing the newest', () => {
    // Which end is sacrificed matters: the caller of the newest is a phone
    // waiting on this response, while the holder of the oldest has had the
    // longest to spend it and loses only a retry.
    const clock = fakeClock();
    const store = createRefreshChallengeStore({ ttlMs: 60_000, maxLive: 2, now: clock.now });
    const first = store.issue();
    const second = store.issue();

    const third = store.issue();

    expect(store.consume(first.nonce)).toBe(false);
    expect(store.consume(second.nonce)).toBe(true);
    expect(store.consume(third.nonce)).toBe(true);
  });
});

describe('the bound on live challenges', () => {
  it('holds only while the TTL is no longer than the route budget window', () => {
    // `refresh-challenge.ts` claims live entries cannot exceed one window's
    // global limit, and `refresh-rate-limit.ts` states the same constraint from
    // the other side. Both are true only if a nonce cannot outlive the window
    // that bounded its issuance — raising either constant alone breaks the
    // claim silently, so it is pinned here rather than in prose twice.
    expect(CHALLENGE_TTL_MS).toBeLessThanOrEqual(REFRESH_RATE_LIMIT_WINDOW_MS);
  });

  it('has a backstop the rate limiter should keep out of reach', () => {
    expect(DEFAULT_MAX_LIVE_CHALLENGES).toBeGreaterThan(0);
  });
});
