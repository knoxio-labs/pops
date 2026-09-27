import { describe, expect, it } from 'vitest';

import { unwrap } from './api-error.js';

import type { ApiError } from './api-error.js';

describe('unwrap', () => {
  it('decodes an ADR-054 envelope', () => {
    const details = { field: 'name' };
    expect(() =>
      unwrap({
        error: {
          code: 'inventory.item.not_found',
          details,
          message: 'Item not found',
          requestId: '01K123',
          retryable: false,
        },
        response: new Response(null, { status: 404 }),
      })
    ).toThrowError(
      expect.objectContaining<Partial<ApiError>>({
        code: 'inventory.item.not_found',
        details,
        kind: 'client',
        message: 'Item not found',
        requestId: '01K123',
        retryable: false,
        status: 404,
      })
    );
  });

  it('uses the HTTP status for a non-JSON failure', () => {
    expect(() =>
      unwrap({ error: '<html>bad gateway</html>', response: new Response(null, { status: 502 }) })
    ).toThrowError(
      expect.objectContaining<Partial<ApiError>>({
        code: 'web.http.502',
        kind: 'server',
        retryable: true,
        status: 502,
      })
    );
  });

  it('classifies a fetch rejection as offline without matching its message', async () => {
    await expect(
      unwrap(Promise.reject(new TypeError('arbitrary browser wording')))
    ).rejects.toMatchObject({
      code: 'web.net.offline',
      kind: 'offline',
      retryable: true,
    });
  });

  it('classifies AbortError as timeout', async () => {
    await expect(
      unwrap(Promise.reject(new DOMException('cancelled', 'AbortError')))
    ).rejects.toMatchObject({ code: 'web.net.timeout', kind: 'timeout', retryable: true });
  });

  it('classifies an empty successful result as a client error', () => {
    expect(() => unwrap({ response: new Response(null, { status: 204 }) })).toThrowError(
      expect.objectContaining<Partial<ApiError>>({
        code: 'web.client.no_data',
        kind: 'client',
        retryable: false,
        status: 204,
      })
    );
  });
});
