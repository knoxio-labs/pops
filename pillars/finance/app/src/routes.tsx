/**
 * Finance app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-finance and mounts them under /finance/*.
 */
import { lazy } from 'react';

import type { RouteObject } from 'react-router';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const TransactionsPage = lazy(() =>
  import('./pages/TransactionsPage').then((m) => ({
    default: m.TransactionsPage,
  }))
);
const EntitiesPage = lazy(() =>
  import('./pages/EntitiesPage').then((m) => ({ default: m.EntitiesPage }))
);
const BudgetsPage = lazy(() =>
  import('./pages/BudgetsPage').then((m) => ({ default: m.BudgetsPage }))
);
const WishlistPage = lazy(() =>
  import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage }))
);
const ImportPage = lazy(() =>
  import('./pages/ImportPage').then((m) => ({ default: m.ImportPage }))
);
const RulesBrowserPage = lazy(() =>
  import('./pages/RulesBrowserPage').then((m) => ({ default: m.RulesBrowserPage }))
);
const TagRulesBrowserPage = lazy(() =>
  import('./pages/TagRulesBrowserPage').then((m) => ({ default: m.TagRulesBrowserPage }))
);
const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);

export { navConfig } from './nav';

export const routes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'entities', element: <EntitiesPage /> },
  { path: 'budgets', element: <BudgetsPage /> },
  { path: 'wishlist', element: <WishlistPage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'rules', element: <RulesBrowserPage /> },
  { path: 'tag-rules', element: <TagRulesBrowserPage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
];
