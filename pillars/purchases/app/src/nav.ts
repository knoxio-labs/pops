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
  id: 'purchases',
  label: 'Purchases',
  labelKey: 'purchases',
  icon: 'Receipt',
  color: 'rose',
  basePath: '/purchases',
  items: [
    { path: '', label: 'Reconcile', labelKey: 'purchases.reconcile', icon: 'Receipt' },
    {
      path: '/merchants',
      label: 'Merchants',
      labelKey: 'purchases.merchants',
      icon: 'Building2',
    },
    {
      path: '/receipts',
      label: 'Receipts',
      labelKey: 'purchases.receipts',
      icon: 'FileText',
    },
    {
      path: '/products',
      label: 'Products',
      labelKey: 'purchases.products',
      icon: 'Package',
    },
  ],
} satisfies AppNavConfigShape;
