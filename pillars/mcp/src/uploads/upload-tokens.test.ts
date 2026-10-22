import { describe, expect, it } from 'vitest';

import {
  createUploadTokenStore,
  MAX_PENDING_UPLOADS,
  UPLOAD_TOKEN_TTL_MS,
} from './upload-tokens.js';

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return { now: () => current, advance: (ms) => (current += ms) };
}

function mintOrThrow(store: ReturnType<typeof createUploadTokenStore>): string {
  const grant = store.mint();
  if (grant === undefined) throw new Error('store refused to mint');
  return grant.token;
}

describe('createUploadTokenStore', () => {
  it('mints unguessable, distinct tokens with a ten-minute expiry', () => {
    const time = clock();
    const store = createUploadTokenStore(time.now);
    const first = store.mint();
    const second = store.mint();
    expect(first?.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first?.token).not.toBe(second?.token);
    expect(first?.expiresAt.getTime()).toBe(time.now() + UPLOAD_TOKEN_TTL_MS);
  });

  it('spends a token on first use', () => {
    const store = createUploadTokenStore(clock().now);
    const token = mintOrThrow(store);
    expect(store.consume(token)).toBe(true);
    expect(store.consume(token)).toBe(false);
  });

  it('refuses a token that was never minted', () => {
    const store = createUploadTokenStore(clock().now);
    mintOrThrow(store);
    expect(store.consume('not-a-token')).toBe(false);
    expect(store.consume('')).toBe(false);
  });

  it('refuses a token at and after its expiry, and does not revive it', () => {
    const time = clock();
    const store = createUploadTokenStore(time.now);
    const atExpiry = mintOrThrow(store);
    const justBefore = mintOrThrow(store);
    time.advance(UPLOAD_TOKEN_TTL_MS - 1);
    expect(store.consume(justBefore)).toBe(true);
    time.advance(1);
    expect(store.consume(atExpiry)).toBe(false);
    expect(store.consume(atExpiry)).toBe(false);
  });

  it('caps outstanding tokens and frees capacity once they expire or are spent', () => {
    const time = clock();
    const store = createUploadTokenStore(time.now);
    const tokens = Array.from({ length: MAX_PENDING_UPLOADS }, () => mintOrThrow(store));
    expect(store.mint()).toBeUndefined();

    const [spent] = tokens;
    if (spent === undefined) throw new Error('no tokens minted');
    expect(store.consume(spent)).toBe(true);
    expect(store.mint()).toBeDefined();
    expect(store.mint()).toBeUndefined();

    time.advance(UPLOAD_TOKEN_TTL_MS);
    expect(store.mint()).toBeDefined();
  });
});
