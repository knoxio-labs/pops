/**
 * AI app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-ai and mounts them under /ai/*.
 */
import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { AiPageSlot } from '@pops/ai/manifest';

const AiUsagePage = lazy(() =>
  import('./pages/AiUsagePage').then((m) => ({ default: m.AiUsagePage }))
);

/**
 * The three redirects are components rather than inline elements because the
 * loader resolves a page slot to a `ComponentType` and renders it itself — an
 * element built here would be constructed once at module scope and never see
 * the router it is mounted under.
 */
const PromptsRedirect = () => <Navigate to="/finance/prompts" replace />;
const ConfigRedirect = () => <Navigate to="/settings#ai.config" replace />;
const RulesRedirect = () => <Navigate to="/finance/rules" replace />;

export { navConfig } from './nav';

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `AI_PAGES` with nothing to render fails to
 * compile here, and a component bound to a slot the contract does not declare
 * fails the same way. `bundles` is this map under the name the wire uses.
 */
export const PAGE_COMPONENTS = {
  'ai-usage': AiUsagePage,
  'ai-prompts': PromptsRedirect,
  'ai-config': ConfigRedirect,
  'ai-rules': RulesRedirect,
} satisfies Record<AiPageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
  { path: 'prompts', element: <PromptsRedirect /> },
  { path: 'config', element: <ConfigRedirect /> },
  { path: 'rules', element: <RulesRedirect /> },
];
