/**
 * Finance pillar manifest payload builder.
 *
 * Declares the wire-format manifest the finance pillar registers with the
 * central registry on boot (opt-in via `POPS_REGISTRY_ENABLED`). The `nav`
 * + `pages` UI dimensions let the shell derive the finance app-rail entry
 * and route surface from the registry walk. The shell renders THIS nav, not
 * the app's — which used to mean an item declared only on the app side had no
 * link anywhere. There is one declaration now, in the contract, in the
 * kebab-case wire form `NavConfigDescriptorSchema` requires; this file and the
 * app both project it, and the app's projection is where the PascalCase icons
 * come from (POPS-3359).
 */
import { FINANCE_NAV } from '../contract/nav.js';
import { FINANCE_PAGES as CONTRACT_PAGES } from '../contract/pages.js';
import { financeManifest } from '../contract/settings/index.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

export const FINANCE_PILLAR_ID = 'finance' as const;

/**
 * Runtime capability heartbeat for finance. Advertises `settings: true` so the
 * shell's live-registry settings discovery routes finance's settings reads and
 * writes to finance's own federated `/settings/*` surface (capability-gated)
 * rather than falling back to the registry pillar.
 */
export function buildFinanceCapabilityReporter(): CapabilityReporter {
  return () => ({ settings: true });
}

/** Projected from the contract; the `satisfies` is the conformance check. */
const FINANCE_WIRE_NAV = {
  ...FINANCE_NAV,
  items: [...FINANCE_NAV.items],
} satisfies NavConfigDescriptor;

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 *
 * Root-relative rather than absolute: the same deployment is reached by LAN
 * name, Tailscale name and `localhost`, so no absolute origin written here
 * would be right on all of them. The path is served by the shell's own nginx,
 * which keeps the module request same-origin — that is what makes the shell's
 * shared-runtime import map apply to it, with no CORS posture to get wrong.
 */
const FINANCE_ASSETS_BASE_URL = '/finance-ui/finance.js';

/**
 * Wire-format pages contribution for the finance pillar.
 *
 * Projected from the contract's `FINANCE_PAGES` rather than restated here:
 * `@pops/app-finance` binds a component to each of those same slots, and a
 * second copy of the pairing is free to name a different page than the bundle
 * does. The `satisfies` is the conformance check — this is the only place that
 * needs the SDK's `PageDescriptor`, so it is the only place that imports it.
 */
const FINANCE_PAGES = [...CONTRACT_PAGES] as const satisfies readonly PageDescriptor[];

export function buildFinanceManifest(version: string): ManifestPayload {
  return {
    pillar: FINANCE_PILLAR_ID,
    version,
    contract: {
      package: '@pops/finance',
      version,
      tag: `contract-finance@v${version}`,
    },
    routes: {
      queries: [
        'finance.wishlist.list',
        'finance.wishlist.get',
        'finance.budgets.list',
        'finance.budgets.get',
        'finance.transactions.list',
        'finance.transactions.get',
      ],
      mutations: [
        'finance.wishlist.create',
        'finance.wishlist.update',
        'finance.wishlist.delete',
        'finance.budgets.create',
        'finance.budgets.update',
        'finance.budgets.delete',
        'finance.transactions.create',
        'finance.transactions.update',
        'finance.transactions.delete',
        'finance.transactions.restore',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['finance/transaction', 'finance/wishlist-item', 'finance/budget'] },
    consumedSettings: { keys: [] },
    settings: { manifests: [financeManifest] },
    nav: FINANCE_WIRE_NAV,
    pages: [...FINANCE_PAGES],
    assetsBaseUrl: FINANCE_ASSETS_BASE_URL,
    healthcheck: { path: '/health' },
  };
}
