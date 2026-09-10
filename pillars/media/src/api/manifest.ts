import { MEDIA_NAV } from '../contract/nav.js';
import { MEDIA_PAGES } from '../contract/pages.js';
/**
 * Media pillar manifest payload builder.
 *
 * Declares the wire-format manifest the media pillar registers with the
 * central registry on boot (opt-in via `POPS_REGISTRY_ENABLED`). The `nav` +
 * `pages` UI dimensions let the shell derive the media app-rail entry and
 * route surface from the registry walk. The nav is declared once, in the
 * contract, in the kebab-case wire form `NavConfigDescriptorSchema` requires;
 * this file and the app both project it, so neither can drift from the other
 * (POPS-3359).
 */
import {
  arrManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '../contract/settings/index.js';
import { MEDIA_ROUTES } from './manifest-routes.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const MEDIA_PILLAR_ID = 'media' as const;

/**
 * Runtime capability heartbeat for media. Advertises `settings: true` so the
 * shell's live-registry settings discovery routes media's settings reads and
 * writes to media's own federated `/settings/*` surface (capability-gated)
 * rather than falling back to the registry pillar.
 */
export function buildMediaCapabilityReporter(): CapabilityReporter {
  return () => ({ settings: true });
}

/** Projected from the contract; the `satisfies` is the conformance check. */
const MEDIA_WIRE_NAV = { ...MEDIA_NAV, items: [...MEDIA_NAV.items] } satisfies NavConfigDescriptor;

/** Projected from the contract; the `satisfies` is the conformance check. */
const MEDIA_WIRE_PAGES = [...MEDIA_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 * Root-relative, because the same deployment answers to a LAN name, a
 * Tailscale name and `localhost`, and no absolute origin is right on all of
 * them.
 */
const MEDIA_ASSETS_BASE_URL = '/media-ui/media.js';

export function buildMediaManifest(version: string): ManifestPayload {
  return {
    pillar: MEDIA_PILLAR_ID,
    version,
    contract: {
      package: '@pops/media',
      version,
      tag: `contract-media@v${version}`,
    },
    routes: MEDIA_ROUTES,
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['media/movie', 'media/tv-show', 'media/watchlist-item'] },
    consumedSettings: { keys: [] },
    settings: {
      manifests: [plexManifest, arrManifest, rotationManifest, mediaOperationalManifest],
    },
    nav: MEDIA_WIRE_NAV,
    pages: [...MEDIA_WIRE_PAGES],
    assetsBaseUrl: MEDIA_ASSETS_BASE_URL,
    healthcheck: { path: '/health' },
  };
}
