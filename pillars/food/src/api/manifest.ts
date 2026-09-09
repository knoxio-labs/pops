import { FOOD_PAGES } from '../contract/pages.js';

import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const FOOD_PILLAR_ID = 'food' as const;

/**
 * Wire-format nav contribution for the food pillar.
 *
 * Mirrors the `navConfig` in `pillars/food/app/src/routes.tsx`
 * field-for-field; Lucide icon names are kebab-case identifiers per the
 * wire schema. The shell orders apps by `order`.
 */
const FOOD_NAV: NavConfigDescriptor = {
  id: 'food',
  label: 'Food',
  labelKey: 'food',
  icon: 'utensils',
  color: 'amber',
  basePath: '/food',
  order: 40,
  items: [
    { path: '', label: 'Home', labelKey: 'food.home', icon: 'layout-dashboard' },
    { path: '/recipes', label: 'Recipes', labelKey: 'food.recipes', icon: 'book-open' },
    { path: '/inbox', label: 'Inbox', labelKey: 'food.inbox', icon: 'bell' },
    { path: '/plan', label: 'Plan', labelKey: 'food.plan', icon: 'clock' },
    { path: '/fridge', label: 'Fridge', labelKey: 'food.fridge', icon: 'package' },
    { path: '/solve', label: 'Solve', labelKey: 'food.solve', icon: 'compass' },
    {
      path: '/shopping/from-plan',
      label: 'Shopping',
      labelKey: 'food.shopping',
      icon: 'list-checks',
    },
    { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'database' },
    { path: '/prompts', label: 'Prompts', labelKey: 'food.prompts', icon: 'file-text' },
  ],
};

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
    nav: FOOD_NAV,
    pages: [...FOOD_WIRE_PAGES],
    assetsBaseUrl: FOOD_ASSETS_BASE_URL,
    healthcheck: { path: '/health' },
  };
}
