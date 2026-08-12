import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const PURCHASES_PILLAR_ID = 'purchases' as const;

/**
 * Wire-format nav contribution for the purchases pillar.
 *
 * Mirrors the app's `navConfig` (`pillars/purchases/app/src/routes.tsx`)
 * field-for-field; Lucide icon names are kebab-case identifiers per the wire
 * schema.
 *
 * `order` sits between finance (10) and media (20) rather than at the end of
 * the rail. Purchases exists to reconcile against finance transactions and
 * the operator crosses between the two constantly, so the two belong
 * adjacent; the sparse scheme's gaps are what make placing a pillar at its
 * semantic position possible without renumbering everything after it.
 */
const PURCHASES_NAV: NavConfigDescriptor = {
  id: 'purchases',
  label: 'Purchases',
  labelKey: 'purchases',
  icon: 'receipt',
  color: 'rose',
  basePath: '/purchases',
  order: 15,
  items: [{ path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'receipt' }],
};

/**
 * Wire-format pages contribution for the purchases pillar.
 *
 * One descriptor per route declared in the app's `routes` array
 * (`pillars/purchases/app/src/routes.tsx`).
 */
const PURCHASES_PAGES: readonly PageDescriptor[] = [
  { path: '', index: true, bundleSlot: 'purchases-reconcile' },
];

/**
 * Purchases pillar manifest payload.
 *
 * `nav` and `pages` were empty until this pillar had a frontend, because a
 * rail entry pointing at a bundle slot that does not exist is a dead link.
 * `pillars/purchases/app` is that slot, so both dimensions are declared now
 * — one nav item and one page descriptor, matching the one route the app
 * actually mounts.
 *
 * `search`, `ai.tools` and `uri.types` stay empty on purpose, and not for
 * the frontend reason above. A search adapter over purchases is worth
 * having, but declaring one the pillar doesn't implement would make
 * federated search fan out to a 404.
 */
export function buildPurchasesManifest(version: string): ManifestPayload {
  return {
    pillar: PURCHASES_PILLAR_ID,
    version,
    contract: {
      package: '@pops/purchases',
      version,
      tag: `contract-purchases@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    nav: PURCHASES_NAV,
    pages: [...PURCHASES_PAGES],
    healthcheck: { path: '/health' },
  };
}
