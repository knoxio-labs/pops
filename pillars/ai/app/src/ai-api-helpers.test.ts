import { describe, expect, it } from 'vitest';

import { AiApiError, isNotFoundError, isUnavailableError, unwrap } from './ai-api-helpers.js';

describe('unwrap', () => {
  it('returns the generated client data payload', () => {
    expect(unwrap({ data: { enabled: true } })).toEqual({ enabled: true });
  });

  it('throws the shared error for an error response', () => {
    expect(() =>
      unwrap({
        error: {
          code: 'ai.provider.unavailable',
          message: 'Provider is unavailable.',
          requestId: 'req-ai-1',
          retryable: true,
        },
        response: { status: 503 },
      })
    ).toThrowError(
      expect.objectContaining<Partial<AiApiError>>({
        code: 'ai.provider.unavailable',
        kind: 'server',
        message: 'Provider is unavailable.',
        requestId: 'req-ai-1',
        retryable: true,
        status: 503,
      })
    );
  });

  it('throws the configured no-data error when no payload is returned', () => {
    expect(() => unwrap({})).toThrow('ai API returned no data');
  });
});

describe('isNotFoundError', () => {
  it('recognises an AI 404', () => {
    expect(
      isNotFoundError(
        new AiApiError({
          code: 'web.http.404',
          kind: 'client',
          message: 'Missing',
          retryable: false,
          status: 404,
        })
      )
    ).toBe(true);
  });

  it('rejects other errors', () => {
    expect(
      isNotFoundError(
        new AiApiError({
          code: 'web.http.500',
          kind: 'server',
          message: 'Down',
          retryable: true,
          status: 500,
        })
      )
    ).toBe(false);
    expect(isNotFoundError(new Error('unrelated'))).toBe(false);
  });
});

describe('isUnavailableError', () => {
  it.each(['offline', 'timeout', 'server'] as const)('recognises %s failures', (kind) => {
    expect(
      isUnavailableError(
        new AiApiError({
          code: `web.${kind}`,
          kind,
          message: 'Unavailable',
          retryable: true,
        })
      )
    ).toBe(true);
  });

  it('rejects client failures and unrelated values', () => {
    expect(
      isUnavailableError(
        new AiApiError({
          code: 'web.http.400',
          kind: 'client',
          message: 'Invalid',
          retryable: false,
          status: 400,
        })
      )
    ).toBe(false);
    expect(isUnavailableError(new Error('unrelated'))).toBe(false);
  });
});
