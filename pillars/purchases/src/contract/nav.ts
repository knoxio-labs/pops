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
export const PURCHASES_NAV = {
  id: 'purchases',
  label: 'Purchases',
  labelKey: 'purchases',
  icon: 'receipt',
  color: 'rose',
  basePath: '/purchases',
  order: 15,
  items: [
    { path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'receipt' },
    { path: '/merchants', label: 'Merchants', labelKey: 'purchases.merchants', icon: 'building-2' },
    { path: '/receipts', label: 'Receipts', labelKey: 'purchases.receipts', icon: 'file-text' },
    { path: '/products', label: 'Products', labelKey: 'purchases.products', icon: 'package' },
  ],
} as const;
