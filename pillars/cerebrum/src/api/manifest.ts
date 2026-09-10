import { CEREBRUM_NAV } from '../contract/nav.js';
import { CEREBRUM_CAPTURE_SLOT, CEREBRUM_PAGES } from '../contract/pages.js';
/**
 * Cerebrum pillar manifest payload builder.
 *
 * Hand-rolled (see `manifest-type-generation` for the contract-driven
 * generator). Declares the cerebrum + ego settings UI contributions under
 * `settings.manifests`.
 */
import { cerebrumManifest, egoManifest } from '../contract/settings/index.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type {
  CaptureOverlayDescriptor,
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

/** Projected from the contract; the `satisfies` is the conformance check. */
const CEREBRUM_WIRE_NAV = {
  ...CEREBRUM_NAV,
  items: [...CEREBRUM_NAV.items],
} satisfies NavConfigDescriptor;

/** Projected from the contract; the `satisfies` is the conformance check. */
const CEREBRUM_WIRE_PAGES = [...CEREBRUM_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * The capture overlay, mirroring the app's `ModuleManifest`. It travels on the
 * wire now because the shell resolves a loader-mounted pillar's overlay from
 * the manifest and the remote bundle rather than from its compiled bundle map
 * (POPS-3266) — declared in the app alone, the overlay would simply stop
 * appearing when this pillar left that map.
 */
const CEREBRUM_CAPTURE_OVERLAY: CaptureOverlayDescriptor = {
  bundleSlot: CEREBRUM_CAPTURE_SLOT,
  order: 10,
  hotkey: 'cmd+shift+k',
  labelKey: 'cerebrum.captureOverlay.label',
};

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 * Root-relative, because the same deployment answers to a LAN name, a
 * Tailscale name and `localhost`, and no absolute origin is right on all of
 * them.
 */
const CEREBRUM_ASSETS_BASE_URL = '/cerebrum-ui/cerebrum.js';

/**
 * Runtime capability heartbeat for cerebrum. Reports the live
 * `cerebrum.vectorSearch` status (whether sqlite-vec loaded on this
 * connection) alongside `settings: true`, which advertises cerebrum's own
 * federated `/settings/*` surface so the shell routes settings reads/writes to
 * it (capability-gated) rather than falling back to the registry pillar.
 */
export function buildCerebrumCapabilityReporter(vecAvailable: boolean): CapabilityReporter {
  return () => ({ vectorSearch: vecAvailable, settings: true });
}

export function buildCerebrumManifest(version: string): ManifestPayload {
  return {
    pillar: 'cerebrum',
    version,
    contract: {
      package: '@pops/cerebrum',
      version,
      tag: `contract-cerebrum@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [cerebrumManifest, egoManifest] },
    features: [
      {
        key: 'cerebrum.vectorSearch',
        label: 'Vector search (sqlite-vec)',
        description:
          'Semantic and hybrid retrieval. Disabled when the sqlite-vec extension fails to load at startup.',
        default: true,
        scope: 'capability',
        capability: { pillar: 'cerebrum', key: 'vectorSearch' },
      },
    ],
    healthcheck: { path: '/health' },
    nav: CEREBRUM_WIRE_NAV,
    pages: [...CEREBRUM_WIRE_PAGES],
    captureOverlay: CEREBRUM_CAPTURE_OVERLAY,
    assetsBaseUrl: CEREBRUM_ASSETS_BASE_URL,
  };
}
