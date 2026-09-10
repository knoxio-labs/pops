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
export const FOOD_NAV = {
  id: 'food',
  label: 'Food',
  labelKey: 'food',
  icon: 'utensils',
  color: 'amber',
  basePath: '/food',
  order: 40,
  items: [
    { path: '', label: 'Home', labelKey: 'food.home', icon: 'layout-dashboard' },
    { path: '/recipes', label: 'Recipes', labelKey: 'food.recipes', icon: 'book-open' },
    { path: '/inbox', label: 'Inbox', labelKey: 'food.inbox', icon: 'bell' },
    { path: '/plan', label: 'Plan', labelKey: 'food.plan', icon: 'clock' },
    { path: '/fridge', label: 'Fridge', labelKey: 'food.fridge', icon: 'package' },
    { path: '/solve', label: 'Solve', labelKey: 'food.solve', icon: 'compass' },
    {
      path: '/shopping/from-plan',
      label: 'Shopping',
      labelKey: 'food.shopping',
      icon: 'list-checks',
    },
    { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'database' },
    { path: '/prompts', label: 'Prompts', labelKey: 'food.prompts', icon: 'file-text' },
  ],
} as const;
