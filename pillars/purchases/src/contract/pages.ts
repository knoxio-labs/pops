/**
 * The pillar's page surface: one entry per rail-reachable route, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * This lives in the contract rather than beside the wire manifest because two
 * packages need the same pairing and neither can see the other's source. The
 * pillar's `src/api/manifest.ts` projects it onto `ManifestPayload.pages` for
 * the registry; `@pops/app-purchases` resolves each slot to the component its
 * route table already mounts. Declared once, both sides cannot disagree about
 * which page a slot names — the failure this replaces is a manifest
 * advertising `purchases-merchants` while the bundle binds that key to the
 * receipts page, which nothing would have caught.
 *
 * Deliberately free of `@pops/pillar-sdk` types: the app consumes this and has
 * no reason to depend on the manifest schema. `src/api/manifest.ts` is where
 * the `PageDescriptor` conformance is asserted, next to the payload that has
 * to satisfy it.
 */

/**
 * Rail-reachable pages, in route-table order.
 *
 * The order-detail route (`:purchaseId`) is absent, as it is from `navConfig`
 * and from the wire manifest's pages: it takes an id no rail entry can supply,
 * so it is reached from something already holding one.
 */
export const PURCHASES_PAGES = [
  { path: '', index: true, bundleSlot: 'purchases-reconcile' },
  { path: 'merchants', bundleSlot: 'purchases-merchants' },
  { path: 'receipts', bundleSlot: 'purchases-receipts' },
  { path: 'products', bundleSlot: 'purchases-products' },
] as const;

/**
 * Every bundle slot the purchases UI must supply a component for. A remote
 * bundle exporting anything other than exactly these keys is a contract break
 * the shell's loader reports as a missing slot at first navigation.
 */
export type PurchasesPageSlot = (typeof PURCHASES_PAGES)[number]['bundleSlot'];
