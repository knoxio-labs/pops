/**
 * The pillar's navigation surface: the rail entry and the page-nav items.
 *
 * It lives in the contract for the reason `pages.ts` does — two packages need
 * the same declaration and neither can see the other's source.
 * `src/api/manifest.ts` projects it onto the wire for the registry, and the
 * app projects it into the config the rail consumes.
 *
 * Declared in the WIRE form: kebab-case icons, dependency-free, the shape the
 * manifest schema validates. `@pops/navigation`'s `navConfigFromWire` does
 * the PascalCase projection the app needs, at the type level as well as at
 * runtime, so a typo here reddens the app build too (POPS-3359).
 *
 * `as const` rather than annotated: widening it to `NavConfigDescriptor` would
 * erase the icon literals and collapse that projection to `string`.
 */
export const INVENTORY_NAV = {
  id: 'inventory',
  label: 'Inventory',
  labelKey: 'inventory',
  icon: 'package',
  color: 'amber',
  basePath: '/inventory',
  order: 30,
  items: [
    { path: '', label: 'Overview', labelKey: 'inventory.overview', icon: 'layout-dashboard' },
    { path: '/items', label: 'Items', labelKey: 'inventory.items', icon: 'package' },
    { path: '/containers', label: 'Containers', labelKey: 'inventory.containers', icon: 'box' },
    { path: '/locations', label: 'Locations', labelKey: 'inventory.locations', icon: 'map-pin' },
    { path: '/in-hand', label: 'In hand', labelKey: 'inventory.inHand', icon: 'hand' },
    {
      path: '/connections',
      label: 'Connections',
      labelKey: 'inventory.connections',
      icon: 'cable',
    },
    { path: '/types', label: 'Types', labelKey: 'inventory.types', icon: 'shapes' },
    { path: '/reports', label: 'Reports', labelKey: 'inventory.reports', icon: 'bar-chart-3' },
    { path: '/sync', label: 'Sync', labelKey: 'inventory.sync', icon: 'refresh-cw' },
  ],
} as const;
