/**
 * AI app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-ai and mounts them under /ai/*.
 */
import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { RouteObject } from 'react-router';

const AiUsagePage = lazy(() =>
  import('./pages/AiUsagePage').then((m) => ({ default: m.AiUsagePage }))
);

export { navConfig } from './nav';

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
  { path: 'prompts', element: <Navigate to="/finance/prompts" replace /> },
  { path: 'config', element: <Navigate to="/settings#ai.config" replace /> },
  { path: 'rules', element: <Navigate to="/finance/rules" replace /> },
];
