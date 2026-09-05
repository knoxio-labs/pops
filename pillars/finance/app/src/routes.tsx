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
const AccountsPage = lazy(() =>
  import('./pages/AccountsPage').then((m) => ({ default: m.AccountsPage }))
);
const AccountDetailPage = lazy(() =>
  import('./pages/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage }))
);
const AccountCheckpointsPage = lazy(() =>
  import('./pages/AccountCheckpointsPage').then((m) => ({ default: m.AccountCheckpointsPage }))
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
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

export { navConfig } from './nav';

export const routes: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'entities', element: <EntitiesPage /> },
  { path: 'accounts', element: <AccountsPage /> },
  { path: 'accounts/:id', element: <AccountDetailPage /> },
  { path: 'accounts/:id/checkpoints', element: <AccountCheckpointsPage /> },
  { path: 'budgets', element: <BudgetsPage /> },
  { path: 'wishlist', element: <WishlistPage /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'rules', element: <RulesBrowserPage /> },
  { path: 'tag-rules', element: <TagRulesBrowserPage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
  { path: 'settings', element: <SettingsPage /> },
];
