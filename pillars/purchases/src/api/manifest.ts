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
 * The manifest's search-adapter shape, derived from the payload type rather
 * than restated: the SDK's `manifest-schema` barrel does not export it, and a
 * hand-written copy would be free to drift from the zod schema that actually
 * validates this.
 */
type SearchAdapterDescriptor = ManifestPayload['search']['adapters'][number];

/**
 * Free text only, on both adapters.
 *
 * `supportsDateRange` is false because `POST /search` takes a query and a
 * context and nothing else — the order index has `from`/`to` but the search
 * envelope does not carry them through, and advertising a filter the handler
 * ignores is worse than not advertising it. `supportsTags` is false for the
 * same reason: item tags are searchable through `GET /items?tag=`, which is
 * a different route with a closed vocabulary, not this one.
 */
const TEXT_ONLY_QUERY_SHAPE = {
  supportsText: true,
  supportsTags: false,
  supportsDateRange: false,
  supportsScope: [],
} as const satisfies SearchAdapterDescriptor['queryShape'];

/**
 * Two adapters, one procedure. A pillar's `/search` returns a single flat
 * ranked list and the federator decorates at pillar granularity, so the split
 * here describes what the pillar searches, not how many endpoints it serves —
 * the same arrangement finance uses for its three.
 */
const PURCHASES_SEARCH_ADAPTERS: readonly SearchAdapterDescriptor[] = [
  {
    name: 'orders',
    entityType: 'purchase',
    queryShape: TEXT_ONLY_QUERY_SHAPE,
    procedurePath: 'purchases.search.search',
  },
  {
    name: 'lineItems',
    entityType: 'purchase-item',
    queryShape: TEXT_ONLY_QUERY_SHAPE,
    procedurePath: 'purchases.search.search',
  },
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
 * `search.adapters` was never held back on that reasoning, though it used to
 * be justified by it. A search adapter is a backend seam — the orchestrator
 * POSTs `{ query, context }` to the pillar's own `/search` over the pillar SDK
 * and never touches a bundle — so the only thing declaring one requires is
 * that the route exists. It does (`src/contract/rest-search.ts`).
 *
 * `routes.queries` carries that one path because the manifest validator
 * refuses a search adapter whose `procedurePath` no declared route backs
 * (`checkSearchAdapterProceduresAreDeclared`). It is not an inventory of the
 * pillar's routes and does not claim to be one.
 *
 * `ai.tools` stays empty, and that is a different decision from the one
 * above rather than the same one twice: this slot is the pillar hosting tool
 * *definitions* for the orchestrator's AI tool-router to project. The
 * pillar's assistant reach is served instead by MCP tool modules in
 * `pillars/mcp/src/tools/purchases.ts`, which call these routes over the SDK
 * — the same arrangement finance, inventory, media and cerebrum have, none
 * of which declare `ai.tools` either.
 *
 * `uri.types` stays empty because nothing in the fleet resolves a
 * `pops:purchases/*` URI to a route. The app mounts one index route and no
 * order-detail route, so there is still nothing for a hit to land on. Search
 * hits carry those URIs regardless — a hit needs an identity whether or not
 * anything can navigate to it — and the slot is declared once a detail route
 * and a `URI_ROUTE_MAP` entry exist to back it.
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
    routes: { queries: ['purchases.search.search'], mutations: [], subscriptions: [] },
    search: { adapters: [...PURCHASES_SEARCH_ADAPTERS] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    nav: PURCHASES_NAV,
    pages: [...PURCHASES_PAGES],
    healthcheck: { path: '/health' },
  };
}
