/**
 * The pillar's navigation surface: the rail entry and the page-nav items.
 *
 * It lives in the contract for the reason `pages.ts` does — two packages need
 * the same declaration and neither can see the other's source.
 * `src/api/manifest.ts` projects it onto the wire for the registry, and
 * `@pops/app-ai` projects it into the app-side config the rail consumes.
 *
 * Declared in the WIRE form: kebab-case icons, dependency-free, the shape the
 * manifest schema validates. `@pops/navigation`'s `navConfigFromWire` does
 * the PascalCase projection the app needs, at the type level as well as at
 * runtime, so a typo here reddens the app build too (POPS-3359).
 *
 * `as const` rather than annotated: widening it to `NavConfigDescriptor` would
 * erase the icon literals and collapse that projection to `string`.
 */
export const AI_NAV = {
  id: 'ai',
  label: 'AI',
  labelKey: 'ai',
  icon: 'bot',
  color: 'violet',
  basePath: '/ai',
  /**
   * Where the rail puts this pillar. The value the shell's bundle map carried
   * while it was mounted statically, moved here unchanged so the rail does not
   * reorder now that it is not.
   */
  order: 70,
  items: [{ path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'bar-chart-3' }],
} as const;
