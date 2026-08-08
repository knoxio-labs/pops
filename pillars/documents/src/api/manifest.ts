/**
 * Documents pillar manifest payload builder.
 *
 * The documents pillar (ADR-035 bridge kind, ADR-039 workstream 13) owns
 * the paperless-ngx integration. It has no frontend surface (no `nav` /
 * `pages` dimension) and declares no `search`/`ai` dimensions — the
 * paperless bridge exposes only its thin REST contract for now. A future
 * increment can populate `search.adapters` / `ai.tools` once the pillar
 * mirrors document metadata locally instead of proxying live.
 *
 * `uri.types` does carry `documents/document`: other pillars persist soft
 * `pops://documents/document/<id>` references (ADR-042), and `paperless.get`
 * is what resolves one.
 */
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const DOCUMENTS_PILLAR_ID = 'documents' as const;

export function buildDocumentsManifest(version: string): ManifestPayload {
  return {
    pillar: DOCUMENTS_PILLAR_ID,
    version,
    contract: {
      package: '@pops/documents',
      version,
      tag: `contract-documents@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['documents/document'] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
