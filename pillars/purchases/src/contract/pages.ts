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
 * Every page the pillar mounts, in route-table order.
 *
 * The order-detail page carries a `:purchaseId` no rail entry can supply, so
 * it has no nav item — but it is a page like any other and belongs here. That
 * distinction used to be invisible, because the shell mounted an in-repo
 * pillar's whole `routes` array and read this list only for the rail. A pillar
 * mounted through the runtime loader gets exactly the pages this list names,
 * so a route missing from it is a route that does not exist: the reconcile
 * queue, the receipt drop zone and every global-search hit produce a purchase
 * id and link to that page, and all three would 404 while the rail looked
 * correct.
 *
 * "Rail-reachable" is therefore a property to read off a path rather than a
 * property of this list — a page whose path carries a `:` cannot be a nav
 * item.
 */
export const PURCHASES_PAGES = [
  { path: '', index: true, bundleSlot: 'purchases-reconcile' },
  { path: 'merchants', bundleSlot: 'purchases-merchants' },
  { path: 'receipts', bundleSlot: 'purchases-receipts' },
  { path: 'products', bundleSlot: 'purchases-products' },
  { path: ':purchaseId', bundleSlot: 'purchases-order' },
] as const;

/**
 * Every bundle slot the purchases UI must supply a component for. A remote
 * bundle exporting anything other than exactly these keys is a contract break
 * the shell's loader reports as a missing slot at first navigation.
 */
export type PurchasesPageSlot = (typeof PURCHASES_PAGES)[number]['bundleSlot'];
