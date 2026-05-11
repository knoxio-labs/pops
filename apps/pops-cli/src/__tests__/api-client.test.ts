/**
 * Wire-format regression tests. These pin the request/response shape the CLI
 * speaks to the pops-api tRPC endpoint, so a future change to either side
 * breaks here instead of silently failing in the field.
 *
 * The pops-api router has no transformer configured (no `superjson`), so
 * tRPC sends inputs as raw JSON (no `{ json: ... }` envelope) and successes
 * come back as `{ result: { data: <payload> } }`. The original CLI shipped
 * with a SuperJSON-style envelope and was rejected at runtime — see issue
 * #2609.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, ApiUnreachableError, trpcMutation } from '../api-client.js';
import { getFetchCall, getFetchJson, mockFetchOk, mockFetchTrpcError } from './test-helpers.js';

describe('trpcMutation wire format', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the input as a raw JSON object, not wrapped in `{ json: ... }`', async () => {
    const spy = mockFetchOk({ ok: true });
    await trpcMutation(
      { apiUrl: 'http://api.test', apiKey: undefined },
      'cerebrum.ingest.quickCapture',
      { text: 'hi', source: 'cli' }
    );
    expect(getFetchJson(spy)).toEqual({ text: 'hi', source: 'cli' });
  });

  it('reads the success payload from `result.data` (no `.json` envelope)', async () => {
    mockFetchOk({ id: 'eng_x', path: 'capture/eng_x.md', type: 'capture', scopes: ['a'] });
    const result = await trpcMutation<{ id: string }>(
      { apiUrl: 'http://api.test', apiKey: undefined },
      'cerebrum.ingest.quickCapture',
      { text: 'hi' }
    );
    expect(result).toEqual({
      id: 'eng_x',
      path: 'capture/eng_x.md',
      type: 'capture',
      scopes: ['a'],
    });
  });

  it('surfaces tRPC errors from `error.message` (no `.json` envelope on the error side either)', async () => {
    mockFetchTrpcError('text must be a non-empty string', 400, 'BAD_REQUEST');
    await expect(
      trpcMutation(
        { apiUrl: 'http://api.test', apiKey: undefined },
        'cerebrum.ingest.quickCapture',
        {
          text: '',
        }
      )
    ).rejects.toThrow(ApiError);
  });

  it('forwards X-API-Key when the config supplies a key', async () => {
    const spy = mockFetchOk({ ok: true });
    await trpcMutation({ apiUrl: 'http://api.test', apiKey: 'pops_sa_abc' }, 'cerebrum.query.ask', {
      question: 'hi',
    });
    const { init } = getFetchCall(spy);
    const headers = init.headers;
    expect(headers).toBeDefined();
    if (headers && !(headers instanceof Headers) && !Array.isArray(headers)) {
      expect(headers['x-api-key']).toBe('pops_sa_abc');
    } else {
      throw new Error('expected plain-object headers');
    }
  });

  it('wraps fetch-failure errors as ApiUnreachableError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    await expect(
      trpcMutation(
        { apiUrl: 'http://localhost:9999', apiKey: undefined },
        'cerebrum.ingest.quickCapture',
        {
          text: 'hi',
        }
      )
    ).rejects.toBeInstanceOf(ApiUnreachableError);
  });
});
