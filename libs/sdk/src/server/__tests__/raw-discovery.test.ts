import { describe, expect, it, vi } from 'vitest';

import { discoveredPillar } from '../../client/__tests__/fixtures.js';
import { buildRawDiscovery } from '../raw-discovery.js';

import type { DiscoveredPillar, DiscoveryTransport } from '../../client/index.js';

function transport(...pillars: DiscoveredPillar[]): DiscoveryTransport {
  return { fetchSnapshot: vi.fn(() => Promise.resolve(pillars)) };
}

describe('buildRawDiscovery', () => {
  it('applies a configured override, preserves discovered URLs, and returns undefined for unknown pillars', async () => {
    const baseTransport = transport(
      discoveredPillar({ pillarId: 'finance', baseUrl: 'http://finance-from-registry' }),
      discoveredPillar({ pillarId: 'media', baseUrl: 'http://media-from-registry' })
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
      discoveredPillar({ pillarId: 'inventory', baseUrl: 'http://inventory-from-registry' })
    );
    const discovery = buildRawDiscovery({ config: {}, baseTransport });

    await expect(discovery.lookup('inventory')).resolves.toEqual({
      baseUrl: 'http://inventory-from-registry',
    });
    expect(baseTransport.fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
