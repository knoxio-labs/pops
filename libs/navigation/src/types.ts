/**
 * Shared type definitions for app context and navigation.
 *
 * Lives in @pops/navigation so shell, app packages, and @pops/ui can all
 * import from here without creating circular dependencies.
 */

import type { PillarId } from '@pops/pillar-sdk';

/**
 * Built-in app identifiers backing the shell's finite default-route table
 * (`APP_BASE_PATHS` / `detectApp` in `AppContextProvider`). This stays a
 * closed union because the path→app mapping is an in-repo fact the build
 * owns. The *active-surface* id is the open `PillarId` (see `AppContext.app`):
 * a registry-discovered pillar can be the active app even though it is not a
 * built-in here (PRD-256 / PRD-243).
 */
export type AppName = 'finance' | 'food' | 'lists' | 'media' | 'inventory' | 'ai' | 'cerebrum';

/**
 * Union of all valid Lucide icon names used across the POPS app rail and
 * page navigation. `iconMap` must provide a component for every member of
 * this union (enforced via `satisfies Record<IconName, LucideIcon>` in
 * `./icon-map.ts`).
 *
 * Add a name here AND add the corresponding import + entry in icon-map.ts.
 */
export type IconName =
  | 'Activity'
  | 'ArrowLeftRight'
  | 'BarChart3'
  | 'Bell'
  | 'Bookmark'
  | 'BookOpen'
  | 'Bot'
  | 'Building2'
  | 'Clock'
  | 'Compass'
  | 'CreditCard'
  | 'Database'
  | 'DollarSign'
  | 'Download'
  | 'FileText'
  | 'Film'
  | 'GitPullRequest'
  | 'History'
  | 'Landmark'
  | 'Layers'
  | 'LayoutDashboard'
  | 'Library'
  | 'ListChecks'
  | 'MapPin'
  | 'MessageSquare'
  | 'Network'
  | 'Package'
  | 'PiggyBank'
  | 'Plug'
  | 'Receipt'
  | 'Search'
  | 'Settings'
  | 'ShieldCheck'
  | 'Shuffle'
  | 'Smartphone'
  | 'Star'
  | 'Tag'
  | 'Trophy'
  | 'Utensils'
  | 'Zap';

/**
 * One page inside an app, as its `navConfig` declares it.
 */
export interface AppNavItem {
  /** Relative to basePath. Empty string '' for the index/default page. */
  path: string;
  label: string;
  /** i18n key in the `navigation` namespace (e.g. `finance.dashboard`). */
  labelKey: string;
  /** Lucide icon component name — must be a member of IconName. */
  icon: IconName;
}

/**
 * An app package's navigation declaration: what the rail shows for it and
 * which pages its page nav lists.
 *
 * Lives here rather than in the shell because it is the contract between an
 * `@pops/app-*` package and whatever chrome draws it — the shell in
 * production, the design playground's POPS web frame when a screen is being
 * reviewed. Neither chrome owns the shape.
 */
export interface AppNavConfig {
  /** Unique app identifier (e.g. 'finance', 'media', 'inventory'). */
  id: string;
  /** Display name shown in the app rail tooltip and page nav header. */
  label: string;
  /** i18n key in the `navigation` namespace (e.g. `finance`). */
  labelKey: string;
  /** Lucide icon component name for the app rail — must be a member of IconName. */
  icon: IconName;
  /** Optional theme color for this app (e.g. 'emerald', 'indigo'). */
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  /** Root path for this app (e.g. '/finance'). */
  basePath: string;
  /** Pages within this app. */
  items: AppNavItem[];
}

/** An entity the user is currently viewing (e.g. a specific movie or transaction). */
export interface AppContextEntity {
  /** Namespaced URI, e.g. "pops:media/movie/42". */
  uri: string;
  /** Entity type, e.g. "movie", "transaction". */
  type: string;
  /** Human-readable title, e.g. "Fight Club". */
  title: string;
}

/**
 * The current contextual state of the shell — which app is active,
 * which page, what entity (if any) is being viewed, and what filters
 * are applied.
 */
export interface AppContext {
  /** Active app/nav surface, or null at root / unmatched paths. Open to any registry-discovered pillar. */
  app: PillarId | null;
  /** Current page identifier set by the active page component, or null. */
  page: string | null;
  /** Whether the current page is a top-level list/dashboard or a drill-down detail view. */
  pageType: 'top-level' | 'drill-down';
  /** Set when the user is viewing a specific entity. Cleared on navigation. */
  entity?: AppContextEntity;
  /** Active filter state on list pages. Cleared on navigation. */
  filters?: Record<string, string>;
}

/** The default context returned when no app is matched (e.g. root /). */
export const DEFAULT_APP_CONTEXT: AppContext = {
  app: null,
  page: null,
  pageType: 'top-level',
};
