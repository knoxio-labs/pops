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
export const MEDIA_NAV = {
  id: 'media',
  label: 'Media',
  labelKey: 'media',
  icon: 'film',
  color: 'indigo',
  basePath: '/media',
  order: 20,
  items: [
    { path: '', label: 'Library', labelKey: 'media.library', icon: 'library' },
    { path: '/watchlist', label: 'Watchlist', labelKey: 'media.watchlist', icon: 'bookmark' },
    { path: '/history', label: 'History', labelKey: 'media.history', icon: 'clock' },
    { path: '/discover', label: 'Discover', labelKey: 'media.discover', icon: 'compass' },
    { path: '/rankings', label: 'Rankings', labelKey: 'media.rankings', icon: 'trophy' },
    { path: '/search', label: 'Search', labelKey: 'media.search', icon: 'search' },
    { path: '/compare', label: 'Compare', labelKey: 'media.compare', icon: 'arrow-left-right' },
    { path: '/tier-list', label: 'Tier List', labelKey: 'media.tierList', icon: 'layers' },
  ],
} as const;
