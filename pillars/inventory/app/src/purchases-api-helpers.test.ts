import { describe, expect, it } from 'vitest';

import { isUnavailableError, PurchasesApiError, unwrap } from './purchases-api-helpers';

/**
 * The wording the shell's global query-cache handler pattern-matches to raise
 * its "check your connection" toast. A sibling pillar being unreachable is not
 * the reader's connection and is not this app's whole page, so nothing thrown
 * here may carry these.
 */
const SHELL_NETWORK_FRAGMENTS = [
  'Failed to fetch',
  'NetworkError',
  'Network request failed',
  'aborted',
  'timeout',
];

function thrownBy(result: { data?: unknown; error?: unknown; response?: { status: number } }) {
  try {
    unwrap(result);
  } catch (err) {
    if (err instanceof PurchasesApiError) return err;
    throw err;
  }
  throw new Error('unwrap did not throw');
}

describe('unwrap', () => {
  it('returns the payload of a successful result', () => {
    expect(unwrap({ data: { purchases: [] }, response: { status: 200 } })).toEqual({
      purchases: [],
    });
  });

  it('keeps the pillar’s own sentence when the pillar refused', () => {
    const err = thrownBy({
      error: { message: 'transactionUri is required' },
      response: { status: 400 },
    });

    expect(err.failure).toBe('api');
    expect(err.status).toBe(400);
    expect(err.message).toBe('transactionUri is required');
  });

  it('falls back to a generic sentence when the error body carries no message', () => {
    const err = thrownBy({ error: { code: 'nope' }, response: { status: 400 } });

    expect(err.failure).toBe('api');
    expect(err.message).toBe('purchases API request failed');
  });

  it('does not read a non-JSON body as the pillar refusing something', () => {
    const err = thrownBy({ error: 'nope', response: { status: 400 } });

    expect(err.failure).toBe('transport');
  });

  it('classifies an aborted request as transport, DOMException or not', () => {
    const err = thrownBy({ error: new DOMException('The operation was aborted.', 'AbortError') });

    expect(err.failure).toBe('transport');
  });

  it('classifies a thrown fetch failure as transport, not as the pillar answering', () => {
    const err = thrownBy({ error: new TypeError('Failed to fetch'), response: undefined });

    expect(err.failure).toBe('transport');
    expect(err.status).toBeUndefined();
  });

  it('classifies an unparseable body under a 200 as transport', () => {
    const err = thrownBy({
      error: new SyntaxError('Unexpected token < in JSON at position 0'),
      response: { status: 200 },
    });

    expect(err.failure).toBe('transport');
    expect(err.status).toBe(200);
  });

  it('treats a result with neither data nor error as transport', () => {
    expect(thrownBy({ response: { status: 200 } }).failure).toBe('transport');
  });

  it('carries none of the wording that would fire the shell’s connection toast', () => {
    const transport = [
      thrownBy({ error: new TypeError('Failed to fetch'), response: undefined }),
      thrownBy({ error: new DOMException('The operation was aborted.', 'AbortError') }),
      thrownBy({ error: new SyntaxError('Unexpected token <') }),
    ];

    for (const err of transport) {
      for (const fragment of SHELL_NETWORK_FRAGMENTS) {
        expect(err.message).not.toContain(fragment);
      }
      expect(err.cause).toBeUndefined();
    }
  });
});

describe('isUnavailableError', () => {
  it('is true for anything that never reached the pillar’s contract', () => {
    expect(
      isUnavailableError(thrownBy({ error: new TypeError('Failed to fetch'), response: undefined }))
    ).toBe(true);
  });

  it('is true for a 200 that was not the pillar speaking', () => {
    expect(
      isUnavailableError(
        thrownBy({ error: new SyntaxError('Unexpected token <'), response: { status: 200 } })
      )
    ).toBe(true);
  });

  it('is true when the pillar failed server-side', () => {
    expect(
      isUnavailableError(thrownBy({ error: { message: 'boom' }, response: { status: 503 } }))
    ).toBe(true);
  });

  it('is false when the pillar refused the request', () => {
    expect(
      isUnavailableError(
        thrownBy({ error: { message: 'transactionUri is required' }, response: { status: 400 } })
      )
    ).toBe(false);
  });

  it('is false for anything that is not this client’s error', () => {
    expect(isUnavailableError(new Error('Failed to fetch'))).toBe(false);
  });
});
