/**
 * Inventory pillar manifest payload builder.
 *
 * Hand-rolled — `pillars/lists` is the only pillar that generates its manifest
 * (`pillars/lists/scripts/generate-manifest.ts`); everywhere else the payload
 * is written out. Declares the inventory settings UI contribution under
 * `settings.manifests` and the `nav` + `pages` UI
 * dimensions so the shell can mount the inventory app-rail entry and
 * routes from the registry walk. The `nav` and `pages` values mirror
 * `pillars/inventory/app/src/routes.tsx` verbatim (icons translated to
 * the kebab-case wire form required by `NavConfigDescriptorSchema`).
 */
import { INVENTORY_PAGES } from '../contract/pages.js';
import { inventoryManifest } from '../contract/settings/index.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

/**
 * Runtime capability heartbeat for inventory. Advertises `settings: true` so
 * the shell's live-registry settings discovery routes inventory's settings
 * reads and writes to inventory's own federated `/settings/*` surface
 * (capability-gated) rather than falling back to the registry pillar.
 */
export function buildInventoryCapabilityReporter(): CapabilityReporter {
  return () => ({ settings: true });
}

const INVENTORY_NAV: NavConfigDescriptor = {
  id: 'inventory',
  label: 'Inventory',
  labelKey: 'inventory',
  icon: 'package',
  color: 'amber',
  basePath: '/inventory',
  order: 30,
  items: [
    { path: '', label: 'Items', labelKey: 'inventory.items', icon: 'package' },
    {
      path: '/warranties',
      label: 'Warranties',
      labelKey: 'inventory.warranties',
      icon: 'shield-check',
    },
    { path: '/locations', label: 'Locations', labelKey: 'inventory.locations', icon: 'map-pin' },
    { path: '/reports', label: 'Reports', labelKey: 'inventory.reports', icon: 'bar-chart-3' },
    {
      path: '/connections',
      label: 'Connections',
      labelKey: 'inventory.connections',
      icon: 'network',
    },
  ],
};

/** Projected from the contract; the `satisfies` is the conformance check. */
const INVENTORY_WIRE_PAGES = [...INVENTORY_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 * Root-relative, because the same deployment answers to a LAN name, a
 * Tailscale name and `localhost`, and no absolute origin is right on all of
 * them.
 */
const INVENTORY_ASSETS_BASE_URL = '/inventory-ui/inventory.js';

export function buildInventoryManifest(version: string): ManifestPayload {
  return {
    pillar: 'inventory',
    version,
    contract: {
      package: '@pops/inventory',
      version,
      tag: `contract-inventory@v${version}`,
    },
    routes: {
      queries: [
        'inventory.locations.tree',
        'inventory.locations.list',
        'inventory.locations.get',
        'inventory.locations.getPath',
        'inventory.locations.children',
        'inventory.locations.deleteStats',
      ],
      mutations: [
        'inventory.locations.create',
        'inventory.locations.update',
        'inventory.locations.delete',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [inventoryManifest] },
    nav: INVENTORY_NAV,
    pages: [...INVENTORY_WIRE_PAGES],
    assetsBaseUrl: INVENTORY_ASSETS_BASE_URL,
    healthcheck: { path: '/health' },
  };
}
