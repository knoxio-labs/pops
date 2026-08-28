/**
 * Guards the Plex token against ever reaching a URL, an error message or a
 * log line. The token is sent as an `X-Plex-Token` header; `redactPlexToken`
 * scrubs any query-form occurrence that comes back to us from upstream text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAbsolute,
  getPath,
  postAbsolute,
  putAbsolute,
  redactPlexToken,
} from '../client-http.js';
import { PlexApiError } from '../types.js';

const TOKEN = 'sUpErSeCrEtToKeN123';

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response): void {
  fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init ?? {}))
  );
  vi.stubGlobal('fetch', fetchMock);
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was never called');
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

function headersOf(init: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, statusText: 'OK' });
}

beforeEach(() => {
  stubFetch(() => jsonOk({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('redactPlexToken', () => {
  it('replaces the token value while keeping the surrounding text', () => {
    expect(redactPlexToken(`https://plex.test/x?X-Plex-Token=${TOKEN}&y=1`)).toBe(
      'https://plex.test/x?X-Plex-Token=[redacted]&y=1'
    );
  });

  it('redacts every occurrence, case-insensitively', () => {
    const text = `a?X-Plex-Token=${TOKEN} and b?x-plex-token=${TOKEN}`;
    const out = redactPlexToken(text);
    expect(out).not.toContain(TOKEN);
    expect(out.match(/\[redacted]/g)).toHaveLength(2);
  });

  it('leaves text without a token untouched', () => {
    expect(redactPlexToken('Plex API error: 500 Error')).toBe('Plex API error: 500 Error');
  });
});

describe('getPath — token transport', () => {
  it('sends the token as a header and never puts it in the URL', async () => {
    await getPath('http://plex.test:32400', TOKEN, '/library/sections');
    const { url, init } = lastCall();
    expect(url).toBe('http://plex.test:32400/library/sections');
    expect(url).not.toContain(TOKEN);
    expect(headersOf(init)['x-plex-token']).toBe(TOKEN);
  });

  it('keeps an existing query string intact without appending the token', async () => {
    await getPath('http://plex.test:32400', TOKEN, '/library/sections/1/all?includeGuids=1');
    const { url } = lastCall();
    expect(url).toBe('http://plex.test:32400/library/sections/1/all?includeGuids=1');
    expect(url).not.toContain('X-Plex-Token');
  });
});

describe('getAbsolute — credentials', () => {
  it('sends the client identifier as a header when supplied', async () => {
    await getAbsolute('https://discover.provider.plex.tv/x', {
      auth: { token: TOKEN, clientId: 'client-abc' },
    });
    const { url, init } = lastCall();
    expect(headersOf(init)['x-plex-token']).toBe(TOKEN);
    expect(headersOf(init)['x-plex-client-identifier']).toBe('client-abc');
    expect(url).not.toContain(TOKEN);
  });

  it('omits the token header entirely when no auth is given', async () => {
    await getAbsolute('https://plex.test/public');
    expect(headersOf(lastCall().init)['x-plex-token']).toBeUndefined();
  });
});

describe('postAbsolute — credentials and body', () => {
  it('sends the token as a header, a JSON content type and the serialized body', async () => {
    await postAbsolute(
      'https://community.plex.tv/api',
      { query: '{ me }' },
      { auth: { token: TOKEN } }
    );
    const { url, init } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ query: '{ me }' }));
    expect(headersOf(init)['content-type']).toBe('application/json');
    expect(headersOf(init)['x-plex-token']).toBe(TOKEN);
    expect(url).not.toContain(TOKEN);
  });

  it('raises a PlexApiError carrying the upstream status', async () => {
    stubFetch(
      () => new Response('You must provide a token!', { status: 401, statusText: 'Unauthorized' })
    );

    const err = await postAbsolute(
      'https://community.plex.tv/api',
      {},
      { context: 'Plex friends API' }
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PlexApiError);
    expect((err as PlexApiError).status).toBe(401);
    expect((err as PlexApiError).message).toContain('You must provide a token!');
  });
});

describe('token never reaches an error message', () => {
  it('redacts the token when fetch throws with the URL in its message', async () => {
    stubFetch(() => {
      throw new TypeError(
        `Failed to parse URL from plex.test/library/sections?X-Plex-Token=${TOKEN}`
      );
    });

    const err = await getPath('plex.test', TOKEN, '/library/sections').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PlexApiError);
    expect((err as PlexApiError).status).toBe(0);
    expect((err as PlexApiError).message).not.toContain(TOKEN);
    expect((err as PlexApiError).message).toContain('[redacted]');
  });

  it('redacts the token when an upstream error body echoes it back', async () => {
    stubFetch(
      () =>
        new Response(`upstream rejected ?X-Plex-Token=${TOKEN}`, {
          status: 401,
          statusText: 'Unauthorized',
        })
    );

    const err = await getPath('http://plex.test:32400', TOKEN, '/library/sections').catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(PlexApiError);
    expect((err as PlexApiError).status).toBe(401);
    expect((err as PlexApiError).message).not.toContain(TOKEN);
  });

  it('redacts a non-string throw stringified into the message', async () => {
    stubFetch(() => {
      throw `boom X-Plex-Token=${TOKEN}`;
    });

    const err = await getPath('http://plex.test:32400', TOKEN, '/x').catch((e: unknown) => e);

    expect((err as PlexApiError).message).not.toContain(TOKEN);
  });

  it('applies the same guarantees to putAbsolute', async () => {
    stubFetch(() => {
      throw new TypeError(`network down ?X-Plex-Token=${TOKEN}`);
    });

    const err = await putAbsolute('https://plex.test/x', TOKEN).catch((e: unknown) => e);

    expect((err as PlexApiError).message).not.toContain(TOKEN);
  });

  it('sends the token as a header on putAbsolute', async () => {
    stubFetch(() => new Response('', { status: 200, statusText: 'OK' }));
    await putAbsolute('https://plex.test/x', TOKEN);
    const { url, init } = lastCall();
    expect(init.method).toBe('PUT');
    expect(headersOf(init)['x-plex-token']).toBe(TOKEN);
    expect(url).not.toContain(TOKEN);
  });

  it('applies the same guarantees to postAbsolute', async () => {
    stubFetch(
      () =>
        new Response(`upstream rejected ?X-Plex-Token=${TOKEN}`, {
          status: 500,
          statusText: 'Server Error',
        })
    );

    const err = await postAbsolute(
      'https://community.plex.tv/api',
      {},
      { auth: { token: TOKEN } }
    ).catch((e: unknown) => e);

    expect((err as PlexApiError).message).not.toContain(TOKEN);
    expect((err as PlexApiError).message).toContain('[redacted]');
  });
});
