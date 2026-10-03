/**
 * Orchestrator manifest payload builder.
 *
 * Declares the wire-format manifest the orchestrator registers with the
 * central registry on boot (opt-in via `POPS_REGISTRY_ENABLED`). The
 * orchestrator is a cross-pillar aggregator that owns no domain DB: its
 * registration declares the read-only `tagged.query` route while search,
 * AI, and URI capabilities remain empty.
 */
import { ORCHESTRATOR_PILLAR_ID } from './pillars/registry.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export function buildOrchestratorManifest(version: string): ManifestPayload {
  return {
    pillar: ORCHESTRATOR_PILLAR_ID,
    version,
    contract: {
      package: '@pops/orchestrator',
      version,
      tag: `contract-orchestrator@v${version}`,
    },
    routes: {
      queries: ['orchestrator.tagged.query'],
      mutations: [],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
