/**
 * The `inventory` strings the playground's inventory screens and kit read
 * through `useTranslation('inventory')`, in the default locale.
 *
 * A fixture rather than an import of the inventory app's catalogue: the app
 * owns that file, and the playground renders its own copies of these screens,
 * so it carries only the keys they read. A screen that reads another key adds
 * it here.
 */
export const INVENTORY_TRANSLATIONS = {
  title: 'Inventory',
  connections: 'Connections',
  'connections.comingSoon': 'The connections graph is coming soon.',
  reports: 'Reports',
  'report.insurance': 'Insurance Report',
  'dashboard.statItems': 'Items',
  'dashboard.statReplacement': 'Replacement',
  'dashboard.statResale': 'Resale',
  'dashboard.statWarranties': 'Warranties',
  'section.active': 'Active',
  'section.expired': 'Expired',
  'section.warrantyTracking': 'Warranty Tracking',
};
