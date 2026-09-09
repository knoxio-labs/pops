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
import { BFM_PAGES } from '../contract/pages.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const BFM_PILLAR_ID = 'bfm' as const;

/**
 * Wire-format nav contribution, mirroring `pillars/bfm/app/src/nav.ts` — same
 * label, labelKey and item, with the icon in the kebab-case the wire schema
 * requires rather than the PascalCase the app spells it in.
 *
 * The rail entry reads "Devices" rather than "BFM" for the reason the app's
 * own nav records: `bfm` is the pillar id and stays the id in code, but the
 * operator-facing surface is a device list and the acronym means nothing
 * outside this repo.
 *
 * `order: 80` is the value the shell's bundle map carried for this pillar
 * while it was mounted statically; it moves here unchanged so the rail does
 * not reorder when the pillar does.
 */
const BFM_NAV: NavConfigDescriptor = {
  id: 'bfm',
  label: 'Devices',
  labelKey: 'bfm',
  icon: 'smartphone',
  color: 'indigo',
  basePath: '/bfm',
  order: 80,
  items: [{ path: '', label: 'Devices', labelKey: 'bfm.devices', icon: 'smartphone' }],
};

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
    nav: BFM_NAV,
    pages: [...BFM_WIRE_PAGES],
    assetsBaseUrl: BFM_ASSETS_BASE_URL,
  };
}
