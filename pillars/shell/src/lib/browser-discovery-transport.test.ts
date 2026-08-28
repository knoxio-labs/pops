/**
 * Tests for the browser SDK discovery transport.
 *
 * The load-bearing assertions are the two facts the shell supplies that the
 * SDK's defaults get wrong in a page: discovery goes to the shell's own
 * `/registry-api` origin, and each discovered pillar is addressed at its
 * browser path rather than the docker `baseUrl` the registry holds.
 */
import { describe, expect, it, vi } from 'vitest';

import { BrowserDiscoveryTransport, browserSdkOptions } from './browser-discovery-transport';
import { pillarApiBase } from './pillar-api-base';

const MANIFEST = {
  pillar: { id: 'media', name: 'Media', version: '1.0.0' },
  contract: { version: '1.0.0' },
};

function snapshotResponse(pillars: unknown[]): Response {
  return new Response(JSON.stringify({ pillars }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function entry(pillarId: string, baseUrl: string) {
  return {
    pillarId,
    baseUrl,
    status: 'healthy',
    manifest: { ...MANIFEST, pillar: { ...MANIFEST.pillar, id: pillarId } },
    lastSeenAt: '2026-08-28T00:00:00.000Z',
    registered: true,
  };
}

describe('pillarApiBase', () => {
  it('routes the registry pillar and the legacy core id to /registry-api', () => {
    expect(pillarApiBase('registry')).toBe('/registry-api');
    expect(pillarApiBase('core')).toBe('/registry-api');
  });

  it('routes every other pillar to its /<id>-api prefix', () => {
    expect(pillarApiBase('media')).toBe('/media-api');
    expect(pillarApiBase('finance')).toBe('/finance-api');
  });
});

describe('BrowserDiscoveryTransport', () => {
  it('discovers over the shell origin, not the docker registry host', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => snapshotResponse([]));

    await new BrowserDiscoveryTransport({ fetchImpl: fetchStub }).fetchSnapshot();

    const url = fetchStub.mock.calls[0]?.[0];
    expect(url).toBe('/registry-api/registry/pillars');
  });

  it('rewrites each container baseUrl to the pillar browser path', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      snapshotResponse([
        entry('media', 'http://media-api:3003'),
        entry('finance', 'http://finance-api:3004'),
      ])
    );

    const pillars = await new BrowserDiscoveryTransport({ fetchImpl: fetchStub }).fetchSnapshot();

    expect(pillars.map((p) => p.baseUrl)).toEqual(['/media-api', '/finance-api']);
  });

  it('preserves the rest of each entry so the availability guard still applies', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      snapshotResponse([{ ...entry('media', 'http://media-api:3003'), status: 'unavailable' }])
    );

    const [media] = await new BrowserDiscoveryTransport({ fetchImpl: fetchStub }).fetchSnapshot();

    expect(media?.pillarId).toBe('media');
    expect(media?.status).toBe('unavailable');
    expect(media?.registered).toBe(true);
  });
});

describe('browserSdkOptions', () => {
  it('supplies a transport so the SDK never falls back to its docker defaults', () => {
    expect(browserSdkOptions.transport).toBeInstanceOf(BrowserDiscoveryTransport);
  });
});
