/** The shared raw lookup applies server SDK base-URL overrides to a snapshot. */
import { describe, expect, it, vi } from 'vitest';

import { buildBfmManifest } from '../../manifest.js';
import { buildRawDiscovery } from '../raw-discovery.js';

import type { DiscoveredPillar, DiscoveryTransport } from '@pops/pillar-sdk/client';

function discoveredPillar(pillarId: string, baseUrl: string): DiscoveredPillar {
  return {
    pillarId,
    baseUrl,
    status: 'healthy',
    manifest: { ...buildBfmManifest('1.0.0'), pillar: pillarId },
    lastSeenAt: '2026-08-08T00:00:00.000Z',
    registered: true,
  };
}

function transport(...pillars: DiscoveredPillar[]): DiscoveryTransport {
  return { fetchSnapshot: vi.fn(() => Promise.resolve(pillars)) };
}

describe('buildRawDiscovery', () => {
  it('applies a configured override, preserves discovered URLs, and returns undefined for unknown pillars', async () => {
    const baseTransport = transport(
      discoveredPillar('finance', 'http://finance-from-registry'),
      discoveredPillar('media', 'http://media-from-registry')
    );
    const discovery = buildRawDiscovery({
      config: { internalBaseUrls: { finance: 'http://finance-internal' } },
      baseTransport,
    });

    await expect(discovery.lookup('finance')).resolves.toEqual({
      baseUrl: 'http://finance-internal',
    });
    await expect(discovery.lookup('media')).resolves.toEqual({
      baseUrl: 'http://media-from-registry',
    });
    await expect(discovery.lookup('unknown')).resolves.toBeUndefined();
    expect(baseTransport.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('uses discovered base URLs when no overrides are configured', async () => {
    const baseTransport = transport(
      discoveredPillar('inventory', 'http://inventory-from-registry')
    );
    const discovery = buildRawDiscovery({ config: {}, baseTransport });

    await expect(discovery.lookup('inventory')).resolves.toEqual({
      baseUrl: 'http://inventory-from-registry',
    });
    expect(baseTransport.fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
