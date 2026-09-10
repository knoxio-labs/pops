/**
 * bfm pillar manifest payload builder — what the pillar POSTs to the
 * `registry` pillar on boot.
 *
 * Every cross-pillar dimension is empty and that is the current truth, not a
 * placeholder: bfm serves one native client over HTTP and publishes nothing
 * for a sibling pillar to search, call as an AI tool, or resolve as a URI.
 *
 * `nav` and `pages` are NOT empty, and the comment here used to say they were
 * — written when the pillar had no frontend, and left behind when
 * `pillars/bfm/app` arrived. It went unnoticed because the shell mounted that
 * app from its static bundle map and never read these dimensions. Mounting it
 * through the runtime loader is what makes them load-bearing: the rail entry
 * and the route both come off this wire now (POPS-3221).
 */
import { BFM_NAV } from '../contract/nav.js';
import { BFM_PAGES } from '../contract/pages.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const BFM_PILLAR_ID = 'bfm' as const;

/** Projected from the contract; the `satisfies` is the conformance check. */
const BFM_WIRE_NAV = { ...BFM_NAV, items: [...BFM_NAV.items] } satisfies NavConfigDescriptor;

/** Projected from the contract; the `satisfies` is the conformance check. */
const BFM_WIRE_PAGES = [...BFM_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 * Root-relative, because the same deployment answers to a LAN name, a
 * Tailscale name and `localhost`, and no absolute origin is right on all of
 * them.
 */
const BFM_ASSETS_BASE_URL = '/bfm-ui/bfm.js';

export function buildBfmManifest(version: string): ManifestPayload {
  return {
    pillar: BFM_PILLAR_ID,
    version,
    contract: {
      package: '@pops/bfm',
      version,
      tag: `contract-bfm@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    nav: BFM_WIRE_NAV,
    pages: [...BFM_WIRE_PAGES],
    assetsBaseUrl: BFM_ASSETS_BASE_URL,
  };
}
