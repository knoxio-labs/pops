import { describe, expect, it } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { isNetworkError } from './network-error';

describe('isNetworkError', () => {
  it.each(['offline', 'timeout'] as const)('accepts an ApiError classified as %s', (kind) => {
    expect(
      isNetworkError(
        new ApiError({
          code: kind === 'offline' ? 'web.net.offline' : 'web.net.timeout',
          kind,
          message: 'network failure',
          retryable: true,
        })
      )
    ).toBe(true);
  });

  it('follows a typed cause without inspecting messages', () => {
    const cause = new ApiError({
      code: 'web.net.offline',
      kind: 'offline',
      message: 'network failure',
      retryable: true,
    });
    expect(isNetworkError(new Error('wrapper', { cause }))).toBe(true);
  });

  it('does not classify message lookalikes or HTTP errors as network failures', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false);
    expect(
      isNetworkError(
        new ApiError({
          code: 'web.http.503',
          kind: 'server',
          message: 'Unavailable',
          retryable: true,
          status: 503,
        })
      )
    ).toBe(false);
  });
});
