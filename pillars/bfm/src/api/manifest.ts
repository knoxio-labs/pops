/**
 * bfm pillar manifest payload builder — what the pillar POSTs to the
 * `registry` pillar on boot.
 *
 * Every cross-pillar dimension is empty and that is the current truth, not a
 * placeholder: bfm serves one native client over HTTP and publishes nothing
 * for a sibling pillar to search, call as an AI tool, or resolve as a URI. It
 * has no frontend surface either, so no `nav`/`pages` dimension.
 */
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const BFM_PILLAR_ID = 'bfm' as const;

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
  };
}
