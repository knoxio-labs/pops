import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

/** Stable registry id for this pillar. */
export const TAGS_PILLAR_ID = 'tags' as const;

/** Build the registry manifest for the tags contract and health route. */
export function buildTagsManifest(version: string): ManifestPayload {
  return {
    pillar: TAGS_PILLAR_ID,
    version,
    contract: {
      package: '@pops/tags',
      version,
      tag: `contract-tags@v${version}`,
    },
    routes: { queries: ['tags.tags.list'], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
