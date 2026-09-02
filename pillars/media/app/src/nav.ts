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
  id: 'media',
  label: 'Media',
  labelKey: 'media',
  icon: 'Film',
  color: 'indigo',
  basePath: '/media',
  items: [
    { path: '', label: 'Library', labelKey: 'media.library', icon: 'Library' },
    { path: '/watchlist', label: 'Watchlist', labelKey: 'media.watchlist', icon: 'Bookmark' },
    { path: '/history', label: 'History', labelKey: 'media.history', icon: 'Clock' },
    { path: '/discover', label: 'Discover', labelKey: 'media.discover', icon: 'Compass' },
    { path: '/rankings', label: 'Rankings', labelKey: 'media.rankings', icon: 'Trophy' },
    { path: '/search', label: 'Search', labelKey: 'media.search', icon: 'Search' },
    { path: '/compare', label: 'Compare', labelKey: 'media.compare', icon: 'ArrowLeftRight' },
    { path: '/tier-list', label: 'Tier List', labelKey: 'media.tierList', icon: 'Layers' },
  ],
} satisfies AppNavConfigShape;
