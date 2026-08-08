/**
 * That the two SDK surfaces bfm configures end up pointing at the same place.
 *
 * They have separate module-level state — the server `pillar()` factory keeps
 * its own registry origin, and the discovery cache behind `pillarRegistry()`
 * keeps another — so nothing but this test stops a deployment from calling
 * pillars discovered by one registry while reporting a roster read from a
 * different one. The symptom would be a mobile bootstrap listing a federation
 * bfm cannot actually reach, which is precisely the lie that endpoint exists
 * to prevent.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { disposeDiscoveryClient, pillarRegistry } from '@pops/pillar-sdk/discovery';
import { getServerSdkConfig, __resetServerSdkConfig } from '@pops/pillar-sdk/server';
import { configureDiscoveryForTest } from '@pops/pillar-sdk/testing/discovery';

import { configureBfmServerSdk } from '../sdk-config.js';

// Both surfaces are process-wide, and these tests write to both. Disposing the
// discovery client returns its configuration — origin and injected fetcher —
// to defaults, not just its cached snapshot, so this is a complete teardown
// rather than half of one.
afterEach(() => {
  __resetServerSdkConfig();
  disposeDiscoveryClient();
});

/** Records the origin the discovery cache actually fetches from. */
function recordingDiscovery(): { urls: string[] } {
  const urls: string[] = [];
  configureDiscoveryForTest({
    fetcher: (registryUrl) => {
      urls.push(registryUrl);
      return Promise.resolve({ pillars: [], fetchedAt: new Date() });
    },
  });
  return { urls };
}

const KEY_ENV: NodeJS.ProcessEnv = { POPS_INTERNAL_API_KEY: 'pops_sa_test.secret' };

describe('configureBfmServerSdk', () => {
  it('points the discovery cache at the registry the server SDK was given', async () => {
    const discovery = recordingDiscovery();

    configureBfmServerSdk({ ...KEY_ENV, POPS_REGISTRY_URL: 'http://registry.example:3001' });
    await pillarRegistry();

    expect(getServerSdkConfig().registry?.registryUrl).toBe('http://registry.example:3001');
    expect(discovery.urls).toEqual(['http://registry.example:3001']);
  });

  it('falls back to the in-cluster origin on both surfaces at once', async () => {
    const discovery = recordingDiscovery();

    configureBfmServerSdk({ ...KEY_ENV });
    await pillarRegistry();

    expect(discovery.urls).toEqual([getServerSdkConfig().registry?.registryUrl]);
  });

  it('hands back the base-URL overrides so the reachability probe uses the same map', () => {
    recordingDiscovery();

    const config = configureBfmServerSdk({
      ...KEY_ENV,
      POPS_INTERNAL_BASE_URLS: 'finance:http://localhost:3010,media:http://localhost:3006',
    });

    expect(config.internalBaseUrls).toEqual({
      finance: 'http://localhost:3010',
      media: 'http://localhost:3006',
    });
    expect(getServerSdkConfig().internalBaseUrls).toEqual(config.internalBaseUrls);
  });

  it('hands back an empty map rather than undefined when nothing is overridden', () => {
    recordingDiscovery();

    const config = configureBfmServerSdk({ ...KEY_ENV });

    expect(config.internalBaseUrls).toEqual({});
  });
});
