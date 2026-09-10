import { FOOD_NAV } from '../contract/nav.js';
import { FOOD_PAGES } from '../contract/pages.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const FOOD_PILLAR_ID = 'food' as const;

/** Projected from the contract; the `satisfies` is the conformance check. */
const FOOD_WIRE_NAV = { ...FOOD_NAV, items: [...FOOD_NAV.items] } satisfies NavConfigDescriptor;

/** Projected from the contract; the `satisfies` is the conformance check. */
const FOOD_WIRE_PAGES = [...FOOD_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 * Root-relative, because the same deployment answers to a LAN name, a
 * Tailscale name and `localhost`, and no absolute origin is right on all of
 * them.
 */
const FOOD_ASSETS_BASE_URL = '/food-ui/food.js';

/**
 * Builds the food pillar manifest payload sent to the registry on boot.
 */
export function buildFoodManifest(version: string): ManifestPayload {
  return {
    pillar: FOOD_PILLAR_ID,
    version,
    contract: {
      package: '@pops/food',
      version,
      tag: `contract-food@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    nav: FOOD_WIRE_NAV,
    pages: [...FOOD_WIRE_PAGES],
    assetsBaseUrl: FOOD_ASSETS_BASE_URL,
    healthcheck: { path: '/health' },
  };
}
