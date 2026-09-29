/** Absolute paths shared by inventory navigation and route-resolution checks. */
export const INVENTORY_BASE_PATH = '/inventory';

export const INVENTORY_NAVIGATION_PATHS = {
  overview: INVENTORY_BASE_PATH,
  items: `${INVENTORY_BASE_PATH}/items`,
  containers: `${INVENTORY_BASE_PATH}/containers`,
  locations: `${INVENTORY_BASE_PATH}/locations`,
  inHand: `${INVENTORY_BASE_PATH}/in-hand`,
  connections: `${INVENTORY_BASE_PATH}/connections`,
  types: `${INVENTORY_BASE_PATH}/types`,
  reports: `${INVENTORY_BASE_PATH}/reports`,
  sync: `${INVENTORY_BASE_PATH}/sync`,
  activity: `${INVENTORY_BASE_PATH}/sync?segment=activity`,
  newItem: `${INVENTORY_BASE_PATH}/items/new`,
  bulkEntry: `${INVENTORY_BASE_PATH}/items/bulk-new`,
} as const;

/**
 * Converts an absolute inventory URL into the pathname expected by its mounted
 * React Router route table, discarding query parameters used by page state.
 */
export function inventoryRoutePath(href: string): string {
  const pathname = new URL(href, 'https://inventory.local').pathname;
  const prefix = `${INVENTORY_BASE_PATH}/`;

  if (pathname === INVENTORY_BASE_PATH) return '/';
  if (!pathname.startsWith(prefix)) {
    throw new Error(`Not an inventory path: ${href}`);
  }
  return pathname.slice(INVENTORY_BASE_PATH.length);
}
