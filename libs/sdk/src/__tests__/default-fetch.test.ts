/**
 * Regression tests for the detached-`fetch` receiver bug.
 *
 * Node's `fetch` ignores its receiver, so the browser failure cannot be
 * reproduced by calling the real global. These tests stub `globalThis.fetch`
 * with a receiver-checking implementation that mimics the browser's
 * `Illegal invocation` TypeError, which is what makes them able to fail: with
 * the transports storing a bare `fetch`, the method call throws.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpDiscoveryTransport } from '../client/discovery.js';
import { defaultFetch } from '../default-fetch.js';

/**
 * A stand-in for the browser's `Window.fetch`: it rejects any call whose
 * receiver is neither `globalThis` nor `undefined`, exactly as Chrome does.
 */
function receiverCheckingFetch(body: unknown): typeof fetch {
  const impl = function (this: unknown): Promise<Response> {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  };
  return impl as unknown as typeof fetch;
}

const SNAPSHOT = {
  pillars: [
    {
      pillarId: 'media',
      baseUrl: '/media-api',
      status: 'healthy',
      manifest: { pillar: { id: 'media' }, contract: { version: '1.0.0' } },
      lastHeartbeatAt: '2026-08-28T00:00:00.000Z',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaultFetch', () => {
  it('works when stored on an object and called as a method', async () => {
    vi.stubGlobal('fetch', receiverCheckingFetch({ ok: true }));
    const holder = { fetchImpl: defaultFetch };

    await expect(holder.fetchImpl('/anything')).resolves.toBeInstanceOf(Response);
  });

  it('resolves the global at call time, so a later stub is honoured', async () => {
    const holder = { fetchImpl: defaultFetch };
    vi.stubGlobal('fetch', receiverCheckingFetch({ late: true }));

    const response = await holder.fetchImpl('/anything');
    expect(await response.json()).toEqual({ late: true });
  });

  it('a bare detached reference throws — the bug this guards against', async () => {
    vi.stubGlobal('fetch', receiverCheckingFetch({ ok: true }));
    const holder = { fetchImpl: globalThis.fetch };

    expect(() => holder.fetchImpl('/anything')).toThrow(/Illegal invocation/);
  });
});

describe('HttpDiscoveryTransport with a receiver-checking global fetch', () => {
  it('fetches the snapshot instead of dying on the receiver check', async () => {
    vi.stubGlobal('fetch', receiverCheckingFetch(SNAPSHOT));
    const transport = new HttpDiscoveryTransport({ registryUrl: '/registry-api' });

    const pillars = await transport.fetchSnapshot();

    expect(pillars).toHaveLength(1);
    expect(pillars[0]?.pillarId).toBe('media');
  });

  it('reports a pillar as discoverable rather than swallowing the receiver error', async () => {
    vi.stubGlobal('fetch', receiverCheckingFetch(SNAPSHOT));
    const transport = new HttpDiscoveryTransport({ registryUrl: '/registry-api' });

    const media = (await transport.fetchSnapshot()).find((p) => p.pillarId === 'media');

    expect(media?.status).toBe('healthy');
    expect(media?.registered).toBe(true);
  });
});
