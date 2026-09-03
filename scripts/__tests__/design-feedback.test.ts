import { describe, expect, it } from 'vitest';

import { createClient, latestStamp, threadsQuery } from '../design-feedback.mjs';

type Client = Exclude<ReturnType<typeof createClient>, { error: string }>;

/** A built client, or a failure naming the reason it could not be built. */
function callable(env: Record<string, string>): Client {
  const client = createClient(env);
  if ('error' in client) throw new Error(`expected a client, got: ${client.error}`);
  return client;
}

describe('createClient', () => {
  it('defaults to the local design-api when POPS_DESIGN_FEEDBACK_URL is unset', () => {
    expect(createClient({})).toHaveProperty('call');
  });

  it('needs no service token for the local default, even with none configured', () => {
    expect(createClient({})).not.toHaveProperty('error');
  });

  it('refuses to build against a remote deployment without both halves of the service token', () => {
    expect(
      createClient({ POPS_DESIGN_FEEDBACK_URL: 'https://x.test', CF_ACCESS_CLIENT_ID: 'a' })
    ).toEqual({ error: expect.stringContaining('service token') });
  });

  it('refuses to build against a remote deployment with no token at all', () => {
    expect(createClient({ POPS_DESIGN_FEEDBACK_URL: 'https://x.test' })).toEqual({
      error: expect.stringContaining('service token'),
    });
  });

  it('builds a caller against a remote deployment when everything is present', () => {
    expect(
      createClient({
        POPS_DESIGN_FEEDBACK_URL: 'https://x.test',
        CF_ACCESS_CLIENT_ID: 'a',
        CF_ACCESS_CLIENT_SECRET: 'b',
      })
    ).toHaveProperty('call');
  });

  it('lets an explicit POPS_DESIGN_FEEDBACK_URL win over the local default', async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      seen.push(String(url));
      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;
    try {
      await callable({
        POPS_DESIGN_FEEDBACK_URL: 'https://x.test',
        CF_ACCESS_CLIENT_ID: 'a',
        CF_ACCESS_CLIENT_SECRET: 'b',
      }).call('/threads');
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]).toBe('https://x.test/threads');
  });

  it('needs no token for an explicit localhost deployment either', () => {
    expect(createClient({ POPS_DESIGN_FEEDBACK_URL: 'http://127.0.0.1:3015' })).toHaveProperty(
      'call'
    );
  });

  /**
   * The credential is a header, never a query parameter — a URL is logged by
   * every proxy between here and the deployment.
   */
  it('sends the service token as headers and nothing in the URL', async () => {
    const seen: Array<{ url: string; headers: Headers }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init.headers) });
      return new Response('{"threads":[]}', { status: 200 });
    }) as typeof globalThis.fetch;
    try {
      await callable({
        POPS_DESIGN_FEEDBACK_URL: 'https://x.test/',
        CF_ACCESS_CLIENT_ID: 'client-id',
        CF_ACCESS_CLIENT_SECRET: 'client-secret',
      }).call('/threads');
    } finally {
      globalThis.fetch = original;
    }

    expect(seen[0]?.url).toBe('https://x.test/threads');
    expect(seen[0]?.headers.get('CF-Access-Client-Id')).toBe('client-id');
    expect(seen[0]?.url).not.toContain('client-secret');
  });

  /**
   * `HeadersInit` may be an array of pairs, and spreading one of those into an
   * object yields numeric keys — dropping the credential silently.
   */
  it('keeps the token when a caller passes headers as an array of pairs', async () => {
    const seen: Headers[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;
    try {
      await callable({
        POPS_DESIGN_FEEDBACK_URL: 'https://x.test',
        CF_ACCESS_CLIENT_ID: 'client-id',
        CF_ACCESS_CLIENT_SECRET: 'b',
      }).call('/threads', { headers: [['x-extra', '1']] });
    } finally {
      globalThis.fetch = original;
    }

    expect(seen[0]?.get('CF-Access-Client-Id')).toBe('client-id');
    expect(seen[0]?.get('x-extra')).toBe('1');
  });

  it('reports a non-OK response as an error rather than as data', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('nope', { status: 403 })) as typeof globalThis.fetch;
    try {
      const client = callable({
        POPS_DESIGN_FEEDBACK_URL: 'https://x.test',
        CF_ACCESS_CLIENT_ID: 'a',
        CF_ACCESS_CLIENT_SECRET: 'b',
      });
      await expect(client.call('/threads')).resolves.toEqual({
        error: expect.stringContaining('403'),
      });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('threadsQuery', () => {
  it('omits the query string entirely when nothing is filtered', () => {
    expect(threadsQuery()).toBe('/threads');
  });

  it('drops empty and undefined filters rather than sending them blank', () => {
    expect(threadsQuery({ status: undefined, route: '', since: undefined })).toBe('/threads');
  });

  it('encodes a route so a slash-bearing address survives', () => {
    expect(threadsQuery({ route: '/s/finance/import-review' })).toBe(
      '/threads?route=%2Fs%2Ffinance%2Fimport-review'
    );
  });

  it('combines filters', () => {
    expect(threadsQuery({ status: 'open', since: '2026-01-01T00:00:00.000Z' })).toBe(
      '/threads?status=open&since=2026-01-01T00%3A00%3A00.000Z'
    );
  });
});

describe('latestStamp', () => {
  it('returns the fallback when there is no activity', () => {
    expect(latestStamp([], '2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('takes the newest thread creation', () => {
    expect(
      latestStamp(
        [{ createdAt: '2026-01-02T00:00:00.000Z' }, { createdAt: '2026-01-03T00:00:00.000Z' }],
        '2026-01-01T00:00:00.000Z'
      )
    ).toBe('2026-01-03T00:00:00.000Z');
  });

  /**
   * A reply is newer than the thread that carries it, and the watcher re-arms
   * from this value — taking the thread stamp would replay the reply forever.
   */
  it('takes a message newer than its own thread', () => {
    expect(
      latestStamp(
        [
          {
            createdAt: '2026-01-02T00:00:00.000Z',
            messages: [{ createdAt: '2026-01-05T00:00:00.000Z' }],
          },
        ],
        '2026-01-01T00:00:00.000Z'
      )
    ).toBe('2026-01-05T00:00:00.000Z');
  });

  it('never moves backwards from the fallback', () => {
    expect(
      latestStamp([{ createdAt: '2020-01-01T00:00:00.000Z' }], '2026-01-01T00:00:00.000Z')
    ).toBe('2026-01-01T00:00:00.000Z');
  });
});
