/**
 * This app's navigation declaration: what the rail shows for it and which
 * pages its page nav lists.
 *
 * Its own module rather than part of `routes.tsx` so that reading the nav
 * does not pull the route table's lazy page imports in with it — the design
 * playground draws the POPS chrome from these configs and has no use for
 * every page of every app.
 */
import type { IconName } from '@pops/navigation';

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  labelKey: string;
  icon: IconName;
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: { path: string; label: string; labelKey: string; icon: IconName }[];
}

export const navConfig = {
  id: 'finance',
  label: 'Finance',
  labelKey: 'finance',
  icon: 'DollarSign',
  color: 'emerald',
  basePath: '/finance',
  items: [
    { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'LayoutDashboard' },
    {
      path: '/transactions',
      label: 'Transactions',
      labelKey: 'finance.transactions',
      icon: 'CreditCard',
    },
    { path: '/entities', label: 'Entities', labelKey: 'finance.entities', icon: 'Building2' },
    { path: '/accounts', label: 'Accounts', labelKey: 'finance.accounts', icon: 'Landmark' },
    { path: '/budgets', label: 'Budgets', labelKey: 'finance.budgets', icon: 'PiggyBank' },
    { path: '/wishlist', label: 'Wish List', labelKey: 'finance.wishList', icon: 'Star' },
    { path: '/import', label: 'Import', labelKey: 'finance.import', icon: 'Download' },
    { path: '/rules', label: 'Rules', labelKey: 'finance.rules', icon: 'BookOpen' },
    { path: '/tag-rules', label: 'Tag Rules', labelKey: 'finance.tagRules', icon: 'Tag' },
    {
      path: '/prompts',
      label: 'Prompt Templates',
      labelKey: 'finance.promptTemplates',
      icon: 'FileText',
    },
    { path: '/settings', label: 'Settings', labelKey: 'finance.settings', icon: 'Settings' },
  ],
} satisfies AppNavConfigShape;
