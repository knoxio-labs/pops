/**
 * The SDK discovery transport the shell runs in a browser.
 *
 * `pillar()`'s default transport discovers from `http://registry-api:3001` and
 * then calls each pillar at the `baseUrl` the registry holds — both docker
 * hostnames, both unresolvable from a page. Every SDK call therefore failed its
 * snapshot fetch, `safeLookup` swallowed the `TypeError`, and the availability
 * guard reported the pillar as `unavailable`: the settings page's "Test" button
 * showed "Pillar 'media' is unavailable" for a pillar that was up and answering
 * the very same page's settings reads over `/media-api`.
 *
 * This wraps the SDK's own HTTP transport — which owns the snapshot wire format,
 * the slash-first path resolution and the legacy fallback — and supplies the two
 * facts only the deployment knows: discover through `/registry-api`, and address
 * each discovered pillar at its browser path rather than its container URL.
 */
import { HttpDiscoveryTransport } from '@pops/pillar-sdk/client';

import { pillarApiBase } from './pillar-api-base.js';

import type {
  DiscoveredPillar,
  DiscoveryTransport,
  HttpDiscoveryTransportOptions,
  PillarClientOptions,
} from '@pops/pillar-sdk/client';

export type BrowserDiscoveryTransportOptions = Omit<HttpDiscoveryTransportOptions, 'registryUrl'>;

/**
 * A {@link DiscoveryTransport} that discovers over the shell's own origin and
 * rewrites every entry's `baseUrl` to the pillar's browser path.
 */
export class BrowserDiscoveryTransport implements DiscoveryTransport {
  private readonly inner: DiscoveryTransport;

  constructor(options: BrowserDiscoveryTransportOptions = {}) {
    this.inner = new HttpDiscoveryTransport({
      ...options,
      registryUrl: pillarApiBase('registry'),
    });
  }

  async fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    const pillars = await this.inner.fetchSnapshot();
    return pillars.map((entry) => ({ ...entry, baseUrl: pillarApiBase(entry.pillarId) }));
  }
}

/**
 * The `PillarSdkProvider` options the shell mounts. Kept as a module constant
 * so the provider's `useMemo` never sees a new object across renders.
 */
export const browserSdkOptions: PillarClientOptions = {
  transport: new BrowserDiscoveryTransport(),
};
