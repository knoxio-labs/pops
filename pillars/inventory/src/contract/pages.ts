/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-inventory` resolves the
 * slot to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The shell mounts exactly
 * the pages listed here and nothing else — so a route missing from this list
 * does not exist (POPS-3223). This is intentionally flat; the later layout
 * route owns nesting.
 *
 * `items/new` and `items/:id/edit` share `inventory-item-form`, while the two
 * insurance redirects share `inventory-insurance-report-redirect`. A slot
 * maps to one component, so two paths may name the same slot.
 */
export const INVENTORY_PAGES = [
  { path: '', index: true, bundleSlot: 'inventory-overview' },
  { path: 'items', bundleSlot: 'inventory-items' },
  { path: 'items/new', bundleSlot: 'inventory-item-form' },
  { path: 'items/bulk-new', bundleSlot: 'inventory-bulk-entry' },
  { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
  { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
  { path: 'items/:id/history', bundleSlot: 'inventory-item-history' },
  { path: 'containers', bundleSlot: 'inventory-containers' },
  { path: 'moving-day', bundleSlot: 'inventory-moving-day' },
  { path: 'in-hand', bundleSlot: 'inventory-in-hand' },
  { path: 'locations', bundleSlot: 'inventory-location-tree' },
  { path: 'locations/:id', bundleSlot: 'inventory-location' },
  { path: 'search', bundleSlot: 'inventory-search' },
  { path: 'connections', bundleSlot: 'inventory-connections' },
  { path: 'connections/fixtures', bundleSlot: 'inventory-fixtures' },
  { path: 'fixtures/:id', bundleSlot: 'inventory-fixture' },
  { path: 'types', bundleSlot: 'inventory-type-catalogue' },
  { path: 'types/:id/arrived', bundleSlot: 'inventory-type-arrived' },
  { path: 'reports', bundleSlot: 'inventory-reports' },
  { path: 'labels', bundleSlot: 'inventory-labels' },
  { path: 'sync', bundleSlot: 'inventory-sync' },
  { path: 'import', bundleSlot: 'inventory-import' },
  { path: 'warranties', bundleSlot: 'inventory-warranties-redirect' },
  { path: 'activity', bundleSlot: 'inventory-activity-redirect' },
  { path: 'reports/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
  { path: 'report', bundleSlot: 'inventory-report-redirect' },
  { path: 'report/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
] as const;

/**
 * Every bundle slot the inventory UI must supply a component for, the nested
 * ones included. A remote bundle exporting anything other than exactly these
 * keys is a contract break the shell's loader reports as a missing slot at
 * first navigation.
 */
type SlotsOf<T> = T extends { readonly bundleSlot: infer S }
  ? T extends { readonly children: readonly (infer C)[] }
    ? S | SlotsOf<C>
    : S
  : never;

export type InventoryPageSlot = SlotsOf<(typeof INVENTORY_PAGES)[number]>;
