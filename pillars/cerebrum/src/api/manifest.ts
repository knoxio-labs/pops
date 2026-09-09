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

/**
 * Wire-format nav contribution, mirroring `pillars/cerebrum/app/src/nav.ts` —
 * same labels, labelKeys and items, with the icons in the kebab-case the wire
 * schema requires rather than the PascalCase the app spells them in.
 *
 * `order: 60` is the value the shell's bundle map carried for this pillar
 * while it was mounted statically; it moves here unchanged so the rail does
 * not reorder when the pillar does.
 */
const CEREBRUM_NAV: NavConfigDescriptor = {
  id: 'cerebrum',
  label: 'Cerebrum',
  labelKey: 'cerebrum',
  icon: 'book-open',
  color: 'sky',
  basePath: '/cerebrum',
  order: 60,
  items: [
    { path: '', label: 'Ingest', labelKey: 'cerebrum.ingest', icon: 'file-text' },
    { path: '/engrams', label: 'Engrams', labelKey: 'cerebrum.engrams.nav', icon: 'library' },
    { path: '/query', label: 'Query', labelKey: 'cerebrum.query.nav', icon: 'search' },
    {
      path: '/documents',
      label: 'Documents',
      labelKey: 'cerebrum.documents.nav',
      icon: 'file-text',
    },
    { path: '/nudges', label: 'Nudges', labelKey: 'cerebrum.nudges', icon: 'bell' },
    {
      path: '/proposals',
      label: 'Proposals',
      labelKey: 'cerebrum.proposals',
      icon: 'git-pull-request',
    },
    { path: '/glia', label: 'Glia', labelKey: 'cerebrum.glia.nav', icon: 'activity' },
    { path: '/reflex', label: 'Reflex', labelKey: 'cerebrum.reflex.nav', icon: 'zap' },
    { path: '/plexus', label: 'Plexus', labelKey: 'cerebrum.plexus.nav', icon: 'plug' },
  ],
};

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
    nav: CEREBRUM_NAV,
    pages: [...CEREBRUM_WIRE_PAGES],
    captureOverlay: CEREBRUM_CAPTURE_OVERLAY,
    assetsBaseUrl: CEREBRUM_ASSETS_BASE_URL,
  };
}
