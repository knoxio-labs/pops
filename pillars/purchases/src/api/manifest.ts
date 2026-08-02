import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const PURCHASES_PILLAR_ID = 'purchases' as const;

/**
 * Purchases pillar manifest payload.
 *
 * No `nav` and no `pages`: this pillar ships no frontend yet, and a nav
 * entry pointing at a bundle slot that doesn't exist would put a dead link
 * on the shell rail. Both dimensions arrive with the UI.
 *
 * `search`, `ai.tools` and `uri.types` are likewise empty on purpose. A
 * search adapter over purchases is worth having, but declaring one the
 * pillar doesn't implement would make federated search fan out to a 404.
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
    healthcheck: { path: '/health' },
  };
}
