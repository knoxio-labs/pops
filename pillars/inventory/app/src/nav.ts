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
  id: 'inventory',
  label: 'Inventory',
  labelKey: 'inventory',
  icon: 'Package',
  color: 'amber',
  basePath: '/inventory',
  items: [
    { path: '', label: 'Items', labelKey: 'inventory.items', icon: 'Package' },
    {
      path: '/warranties',
      label: 'Warranties',
      labelKey: 'inventory.warranties',
      icon: 'ShieldCheck',
    },
    { path: '/locations', label: 'Locations', labelKey: 'inventory.locations', icon: 'MapPin' },
    { path: '/reports', label: 'Reports', labelKey: 'inventory.reports', icon: 'BarChart3' },
    {
      path: '/connections',
      label: 'Connections',
      labelKey: 'inventory.connections',
      icon: 'Network',
    },
  ],
} satisfies AppNavConfigShape;
