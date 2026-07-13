import { describe, expect, it } from 'vitest';

import { INTERNAL_TOKEN_HEADER, passesInternalToken } from '../internal-token.js';

const INTERNAL_PATHS = new Set(['/ai-usage/record', '/ingest/worker-complete']);

describe('INTERNAL_TOKEN_HEADER', () => {
  it('is the canonical lowercase header name', () => {
    expect(INTERNAL_TOKEN_HEADER).toBe('x-pops-internal-token');
  });
});

describe('passesInternalToken', () => {
  it('passes any path outside the internal set, ignoring the token', () => {
    expect(
      passesInternalToken({
        path: '/health',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: undefined,
      })
    ).toBe(true);
  });

  it('passes an internal path when the presented token matches the expected token', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: 'secret',
        expectedToken: 'secret',
      })
    ).toBe(true);
  });

  it('rejects an internal path when the tokens differ', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: 'wrong',
        expectedToken: 'secret',
      })
    ).toBe(false);
  });

  it('fails closed on an internal path when the callee has no expected token configured', () => {
    expect(
      passesInternalToken({
        path: '/ingest/worker-complete',
        internalPaths: INTERNAL_PATHS,
        presentedToken: 'anything',
        expectedToken: undefined,
      })
    ).toBe(false);
  });

  it('rejects an internal path when no token is presented but one is expected', () => {
    expect(
      passesInternalToken({
        path: '/ingest/worker-complete',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: 'secret',
      })
    ).toBe(false);
  });

  it('does not treat two absent tokens as a match (fail-closed)', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: undefined,
      })
    ).toBe(false);
  });

  it('rejects when the expected token is the empty string and none is presented', () => {
    expect(
      passesInternalToken({
        path: '/ai-usage/record',
        internalPaths: INTERNAL_PATHS,
        presentedToken: undefined,
        expectedToken: '',
      })
    ).toBe(false);
  });
});
