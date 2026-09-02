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
 * Local mirror of the shell's `IconName` union. The canonical vocabulary lives
 * in `@pops/navigation` (libs/navigation/src/types.ts); this copy is mirrored to
 * avoid a build cycle. When a new icon ships there, mirror it here if this
 * package needs to reference it.
 */
type IconName =
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
  | 'Search'
  | 'Settings'
  | 'ShieldCheck'
  | 'Shuffle'
  | 'Star'
  | 'Trophy'
  | 'Utensils'
  | 'Zap';
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
  id: 'food',
  label: 'Food',
  labelKey: 'food',
  icon: 'Utensils',
  color: 'amber',
  basePath: '/food',
  items: [
    { path: '', label: 'Home', labelKey: 'food.home', icon: 'LayoutDashboard' },
    { path: '/recipes', label: 'Recipes', labelKey: 'food.recipes', icon: 'BookOpen' },
    { path: '/inbox', label: 'Inbox', labelKey: 'food.inbox', icon: 'Bell' },
    { path: '/plan', label: 'Plan', labelKey: 'food.plan', icon: 'Clock' },
    { path: '/fridge', label: 'Fridge', labelKey: 'food.fridge', icon: 'Package' },
    { path: '/solve', label: 'Solve', labelKey: 'food.solve', icon: 'Compass' },
    {
      path: '/shopping/from-plan',
      label: 'Shopping',
      labelKey: 'food.shopping',
      icon: 'ListChecks',
    },
    { path: '/data', label: 'Manage data', labelKey: 'food.data', icon: 'Database' },
    { path: '/prompts', label: 'Prompts', labelKey: 'food.prompts', icon: 'FileText' },
  ],
} satisfies AppNavConfigShape;
