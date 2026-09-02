/**
 * The design pillar's manifest payload — what it POSTs to the `registry`
 * pillar on boot.
 *
 * Registering is not about discovery for this pillar: its only clients reach
 * it at a fixed path. It registers because the **shell renders its nginx conf
 * from the live registry**, emitting one `/<id>-api/` block per registered
 * pillar. A pillar that never registers has no route in production, however
 * complete the committed `nginx.conf` looks (POPS-2793).
 *
 * Every cross-pillar dimension is empty, and that is the truth rather than a
 * placeholder: comment threads are about this repo's own screens, so there is
 * nothing here for a sibling pillar to search, call as a tool, or resolve as
 * a URI.
 */
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const DESIGN_PILLAR_ID = 'design' as const;

export function buildDesignManifest(version: string): ManifestPayload {
  return {
    pillar: DESIGN_PILLAR_ID,
    version,
    // Required by the payload schema, and the honest answer is thin: the
    // package exists but publishes no contract for another pillar to consume
    // — no exports map, no generated client, nothing vendored anywhere. It
    // names where the pillar lives, not a surface to import.
    contract: {
      package: '@pops/design',
      version,
      tag: `contract-design@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
