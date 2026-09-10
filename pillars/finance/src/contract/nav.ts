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
export const FINANCE_NAV = {
  id: 'finance',
  label: 'Finance',
  labelKey: 'finance',
  icon: 'dollar-sign',
  color: 'emerald',
  basePath: '/finance',
  order: 10,
  items: [
    { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'layout-dashboard' },
    {
      path: '/transactions',
      label: 'Transactions',
      labelKey: 'finance.transactions',
      icon: 'credit-card',
    },
    { path: '/entities', label: 'Entities', labelKey: 'finance.entities', icon: 'building-2' },
    { path: '/accounts', label: 'Accounts', labelKey: 'finance.accounts', icon: 'landmark' },
    { path: '/budgets', label: 'Budgets', labelKey: 'finance.budgets', icon: 'piggy-bank' },
    { path: '/wishlist', label: 'Wish List', labelKey: 'finance.wishList', icon: 'star' },
    { path: '/import', label: 'Import', labelKey: 'finance.import', icon: 'download' },
    { path: '/rules', label: 'Rules', labelKey: 'finance.rules', icon: 'book-open' },
    { path: '/tag-rules', label: 'Tag Rules', labelKey: 'finance.tagRules', icon: 'tag' },
    {
      path: '/prompts',
      label: 'Prompt Templates',
      labelKey: 'finance.promptTemplates',
      icon: 'file-text',
    },
    { path: '/settings', label: 'Settings', labelKey: 'finance.settings', icon: 'settings' },
  ],
} as const;
