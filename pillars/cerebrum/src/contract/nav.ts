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
export const CEREBRUM_NAV = {
  id: 'cerebrum',
  label: 'Cerebrum',
  labelKey: 'cerebrum',
  icon: 'book-open',
  color: 'sky',
  basePath: '/cerebrum',
  order: 60,
  items: [
    { path: '', label: 'Ingest', labelKey: 'cerebrum.ingest', icon: 'file-text' },
    { path: '/engrams', label: 'Engrams', labelKey: 'cerebrum.engrams.nav', icon: 'library' },
    { path: '/query', label: 'Query', labelKey: 'cerebrum.query.nav', icon: 'search' },
    {
      path: '/documents',
      label: 'Documents',
      labelKey: 'cerebrum.documents.nav',
      icon: 'file-text',
    },
    { path: '/nudges', label: 'Nudges', labelKey: 'cerebrum.nudges', icon: 'bell' },
    {
      path: '/proposals',
      label: 'Proposals',
      labelKey: 'cerebrum.proposals',
      icon: 'git-pull-request',
    },
    { path: '/glia', label: 'Glia', labelKey: 'cerebrum.glia.nav', icon: 'activity' },
    { path: '/reflex', label: 'Reflex', labelKey: 'cerebrum.reflex.nav', icon: 'zap' },
    { path: '/plexus', label: 'Plexus', labelKey: 'cerebrum.plexus.nav', icon: 'plug' },
  ],
} as const;
