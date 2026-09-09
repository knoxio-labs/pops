/**
 * Hand-rolled ai pillar manifest payload.
 *
 * Lives in its own module (not inline in `server.ts`) so tests can import the
 * builder without triggering `server.ts`'s boot side-effects (`openAiDb`,
 * `app.listen`, signal handlers).
 *
 * `nav` and `pages` are load-bearing: the ai UI (`@pops/app-ai`) is mounted by
 * the shell's runtime loader from `assetsBaseUrl` rather than compiled into
 * the shell's bundle map, so the rail entry and every route come off this
 * wire (POPS-3220).
 *
 * `contract.package` MUST be `@pops/ai` — the collapsed-pillar form the manifest
 * validator requires for pillar id `ai`, matching the npm package name.
 */
import { AI_PAGES } from '../contract/pages.js';
import { aiConfigManifest } from '../contract/settings/ai-manifest.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type {
  ManifestPayload,
  NavConfigDescriptor,
  PageDescriptor,
} from '@pops/pillar-sdk/manifest-schema';

/**
 * Wire-format nav contribution, mirroring `pillars/ai/app/src/nav.ts` — same
 * label, labelKey and item, with the icons in the kebab-case the wire schema
 * requires rather than the PascalCase the app spells them in.
 *
 * The rail reads "AI" while the pillar is named "AI Ops": the id is `ai`, the
 * manifest name is the operator-facing one, and the rail has room for neither.
 *
 * `order: 70` is the value the shell's bundle map carried for this pillar
 * while it was mounted statically; it moves here unchanged so the rail does
 * not reorder when the pillar does.
 */
const AI_NAV: NavConfigDescriptor = {
  id: 'ai',
  label: 'AI',
  labelKey: 'ai',
  icon: 'bot',
  color: 'violet',
  basePath: '/ai',
  order: 70,
  items: [{ path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'bar-chart-3' }],
};

/** Projected from the contract; the `satisfies` is the conformance check. */
const AI_WIRE_PAGES = [...AI_PAGES] as const satisfies readonly PageDescriptor[];

/**
 * Where the shell's runtime loader fetches this pillar's UI bundle from.
 * Root-relative, because the same deployment answers to a LAN name, a
 * Tailscale name and `localhost`, and no absolute origin is right on all of
 * them.
 */
const AI_ASSETS_BASE_URL = '/ai-ui/ai.js';

/**
 * Runtime capability heartbeat for ai. Advertises `settings: true` so the
 * shell's live-registry settings discovery routes ai's settings reads and
 * writes to ai's own federated `/settings/*` surface (capability-gated) rather
 * than falling back to the registry pillar.
 */
export function buildAiCapabilityReporter(): CapabilityReporter {
  return () => ({ settings: true });
}

export function buildAiManifest(version: string): ManifestPayload {
  return {
    pillar: 'ai',
    version,
    contract: {
      package: '@pops/ai',
      version,
      tag: `contract-ai@v${version}`,
    },
    routes: {
      queries: [
        'ai.usage.getStats',
        'ai.usage.getHistory',
        'ai.observability.getStats',
        'ai.observability.getHistory',
        'ai.observability.getLatencyStats',
        'ai.observability.getQualityMetrics',
        'ai.providers.list',
        'ai.providers.get',
        'ai.providers.healthCheck',
        'ai.budgets.list',
        'ai.budgets.getBudgetStatus',
        'ai.alerts.listRules',
        'ai.alerts.getRule',
        'ai.alerts.list',
        'ai.pricing.lookup',
      ],
      mutations: [
        'ai.ingest.record',
        'ai.providers.upsert',
        'ai.budgets.upsert',
        'ai.alerts.createRule',
        'ai.alerts.updateRule',
        'ai.alerts.deleteRule',
        'ai.alerts.setRuleEnabled',
        'ai.alerts.seedDefaultRules',
        'ai.alerts.acknowledge',
        'ai.alerts.runNow',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [aiConfigManifest] },
    healthcheck: { path: '/health' },
    nav: AI_NAV,
    pages: [...AI_WIRE_PAGES],
    assetsBaseUrl: AI_ASSETS_BASE_URL,
  };
}
