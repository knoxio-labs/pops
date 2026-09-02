/**
 * This app's navigation declaration: what the rail shows for it and which
 * pages its page nav lists.
 *
 * Its own module rather than part of `routes.tsx` so that reading the nav
 * does not pull the route table's lazy page imports in with it — the design
 * playground draws the POPS chrome from these configs and has no use for
 * every page of every app.
 */

/**
 * Local type mirror for compile-time safety (shell owns the canonical types).
 *
 * `IconName` here is the narrow set of icons app-lists actually references,
 * NOT the `@pops/navigation` union: a static dep on `@pops/navigation` would
 * close a `tsc -b` project-reference cycle (`app-food-db` → `app-lists` → `navigation` →
 * `api-client` → `api` → `app-food-db`). Each literal here must also exist
 * in the navigation `IconName` union and the shell `iconMap` — assignability
 * (literal → wider union) catches drift at the shell's `AppNavConfig[]`
 * boundary.
 */
type IconName = 'ListChecks' | 'LayoutDashboard';

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
  id: 'lists',
  label: 'Lists',
  labelKey: 'lists',
  icon: 'ListChecks',
  color: 'sky',
  basePath: '/lists',
  items: [
    { path: '', label: 'Home', labelKey: 'lists.home', icon: 'LayoutDashboard' },
    // Detail pages (`/lists/:id`) are deep links, not sidebar entries.
  ],
} satisfies AppNavConfigShape;
