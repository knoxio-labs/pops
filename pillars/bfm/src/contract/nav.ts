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
export const BFM_NAV = {
  id: 'bfm',
  label: 'Devices',
  labelKey: 'bfm',
  icon: 'smartphone',
  color: 'indigo',
  basePath: '/bfm',
  order: 80,
  items: [{ path: '', label: 'Devices', labelKey: 'bfm.devices', icon: 'smartphone' }],
} as const;
