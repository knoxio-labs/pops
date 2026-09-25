/**
 * Inventory's page nav as designed (owner decisions 2026-09-25): nine items.
 * Labels opens from the Items selection bar and an item's More menu;
 * Activity is a segment of the Sync page; settings are Inventory's section
 * of the shell's Settings app, not a page here. The POPS web frame draws
 * this instead of the shipping nav, so every inventory design sits in the
 * chrome it will ship in.
 *
 * Wire form, like the pillar contract's own nav: kebab-case icons, `order`
 * for the rail.
 */
export const INVENTORY_DESIGN_NAV = {
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

/**
 * Inventory screens whose folder does not name the page they belong to,
 * keyed by screen slug: the page the nav marks while they show. Every other
 * screen sits in the folder of its nav page (`items/item-detail` marks Items).
 */
export const INVENTORY_SCREEN_PAGES: Readonly<Record<string, string>> = {
  'overview/overview': '',
};
