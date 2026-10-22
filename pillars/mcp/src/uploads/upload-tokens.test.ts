import { describe, expect, it } from 'vitest';

import {
  createUploadTokenStore,
  MAX_PENDING_UPLOADS,
  UPLOAD_TOKEN_TTL_MS,
} from './upload-tokens.js';

import type { UploadTarget } from './upload-tokens.js';

const PHOTO: UploadTarget = { kind: 'photo' };

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return { now: () => current, advance: (ms) => (current += ms) };
}

function mintOrThrow(store: ReturnType<typeof createUploadTokenStore>): string {
  const grant = store.mint(PHOTO);
  if (grant === undefined) throw new Error('store refused to mint');
  return grant.token;
}

describe('createUploadTokenStore', () => {
  it('mints unguessable, distinct tokens with a ten-minute expiry', () => {
    const time = clock();
    const store = createUploadTokenStore(time.now);
    const first = store.mint(PHOTO);
    const second = store.mint(PHOTO);
    expect(first?.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first?.token).not.toBe(second?.token);
    expect(first?.expiresAt.getTime()).toBe(time.now() + UPLOAD_TOKEN_TTL_MS);
  });

  it('spends a token on first use', () => {
    const store = createUploadTokenStore(clock().now);
    const token = mintOrThrow(store);
    expect(store.consume(token)).toEqual(PHOTO);
    expect(store.consume(token)).toBeUndefined();
  });

  it('refuses a token that was never minted', () => {
    const store = createUploadTokenStore(clock().now);
    mintOrThrow(store);
    expect(store.consume('not-a-token')).toBeUndefined();
    expect(store.consume('')).toBeUndefined();
  });

  it('refuses a token at and after its expiry, and does not revive it', () => {
    const time = clock();
    const store = createUploadTokenStore(time.now);
    const atExpiry = mintOrThrow(store);
    const justBefore = mintOrThrow(store);
    time.advance(UPLOAD_TOKEN_TTL_MS - 1);
    expect(store.consume(justBefore)).toEqual(PHOTO);
    time.advance(1);
    expect(store.consume(atExpiry)).toBeUndefined();
    expect(store.consume(atExpiry)).toBeUndefined();
  });

  it('caps outstanding tokens and frees capacity once they expire or are spent', () => {
    const time = clock();
    const store = createUploadTokenStore(time.now);
    const tokens = Array.from({ length: MAX_PENDING_UPLOADS }, () => mintOrThrow(store));
    expect(store.mint(PHOTO)).toBeUndefined();

    const [spent] = tokens;
    if (spent === undefined) throw new Error('no tokens minted');
    expect(store.consume(spent)).toEqual(PHOTO);
    expect(store.mint(PHOTO)).toBeDefined();
    expect(store.mint(PHOTO)).toBeUndefined();

    time.advance(UPLOAD_TOKEN_TTL_MS);
    expect(store.mint(PHOTO)).toBeDefined();
  });

  it('returns the target each token was minted for', () => {
    const store = createUploadTokenStore(clock().now);
    const document: UploadTarget = {
      kind: 'document',
      itemId: 'item_1',
      documentType: 'receipt',
      fileName: 'r.pdf',
      maxBytes: 100,
      allowedMimeTypes: ['application/pdf'],
    };
    const photoToken = mintOrThrow(store);
    const documentGrant = store.mint(document);
    if (documentGrant === undefined) throw new Error('store refused to mint');
    expect(store.consume(documentGrant.token)).toEqual(document);
    expect(store.consume(photoToken)).toEqual(PHOTO);
  });
});
