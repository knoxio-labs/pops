import { lazy } from 'react';
import { Navigate } from 'react-router';

import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';

import type { FoodPageSlot } from '@pops/food/manifest';

const FoodLandingPage = lazy(() =>
  import('./pages/FoodLandingPage').then((m) => ({ default: m.FoodLandingPage }))
);
const FoodDataLayout = lazy(() =>
  import('./pages/data/FoodDataLayout').then((m) => ({ default: m.FoodDataLayout }))
);
const IngredientsTab = lazy(() =>
  import('./pages/data/IngredientsTab').then((m) => ({ default: m.IngredientsTab }))
);
const AliasesTab = lazy(() =>
  import('./pages/data/AliasesTab').then((m) => ({ default: m.AliasesTab }))
);
const PrepStatesTab = lazy(() =>
  import('./pages/data/PrepStatesTab').then((m) => ({ default: m.PrepStatesTab }))
);
const SubstitutionsTab = lazy(() =>
  import('./pages/data/SubstitutionsTab').then((m) => ({ default: m.SubstitutionsTab }))
);
const SubGraphPage = lazy(() =>
  import('./pages/data/substitutions-graph/SubGraphPage').then((m) => ({ default: m.SubGraphPage }))
);
const ConversionsTab = lazy(() =>
  import('./pages/data/ConversionsTab').then((m) => ({ default: m.ConversionsTab }))
);
const TagsTab = lazy(() =>
  import('./pages/data/tags-tab/TagsTab').then((m) => ({ default: m.TagsTab }))
);
const PromptViewerPage = lazy(() =>
  import('./pages/PromptViewerPage').then((m) => ({ default: m.PromptViewerPage }))
);
const RecipeListPage = lazy(() =>
  import('./pages/recipes/RecipeListPage').then((m) => ({ default: m.RecipeListPage }))
);
const RecipeDetailPage = lazy(() =>
  import('./pages/recipes/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage }))
);
const RecipeVersionDetailPage = lazy(() =>
  import('./pages/recipes/RecipeVersionDetailPage').then((m) => ({
    default: m.RecipeVersionDetailPage,
  }))
);
const RecipeNewPage = lazy(() =>
  import('./pages/recipes/RecipeNewPage').then((m) => ({ default: m.RecipeNewPage }))
);
const RecipeEditPage = lazy(() =>
  import('./pages/recipes/RecipeEditPage').then((m) => ({ default: m.RecipeEditPage }))
);
const RecipeDraftsPage = lazy(() =>
  import('./pages/recipes/RecipeDraftsPage').then((m) => ({ default: m.RecipeDraftsPage }))
);
const RecipeDraftEditPage = lazy(() =>
  import('./pages/recipes/RecipeDraftEditPage').then((m) => ({ default: m.RecipeDraftEditPage }))
);
const PlanPage = lazy(() => import('./pages/plan/PlanPage').then((m) => ({ default: m.PlanPage })));
const FridgePage = lazy(() =>
  import('./pages/fridge/FridgePage').then((m) => ({ default: m.FridgePage }))
);
const FromPlanPage = lazy(() =>
  import('./pages/shopping/FromPlanPage').then((m) => ({ default: m.FromPlanPage }))
);
const SolvePage = lazy(() =>
  import('./pages/solve/SolvePage').then((m) => ({ default: m.SolvePage }))
);
const InboxPage = lazy(() =>
  import('./pages/inbox/InboxPage').then((m) => ({ default: m.InboxPage }))
);
const InspectorPage = lazy(() =>
  import('./pages/inbox/inspector/InspectorPage').then((m) => ({ default: m.InspectorPage }))
);

/**
 * The `data` layout's index route redirects to the first tab. It is a
 * component rather than an inline element because the loader resolves a page
 * slot to a `ComponentType` and renders it itself.
 */
const DataIndexRedirect = () => <Navigate to="ingredients" replace />;

export { navConfig } from './nav';

/**
 * The component behind each page, keyed by the bundle slot the pillar's
 * manifest advertises for it — the `data` tabs included, which are nested in
 * `FOOD_PAGES` but flat here because a slot is a slot whatever its depth.
 *
 * Keyed by slot rather than by path because that is the key the shell's
 * runtime loader asks for, and `satisfies` pins the key set in both
 * directions: a page added to `FOOD_PAGES` with nothing to render fails to
 * compile here, and a component bound to a slot the contract does not declare
 * fails the same way. `bundles` is this map under the name the wire uses.
 */
export const PAGE_COMPONENTS = {
  'food-landing': FoodLandingPage,
  'food-data-layout': FoodDataLayout,
  'food-data-index': DataIndexRedirect,
  'food-data-ingredients': IngredientsTab,
  'food-data-aliases': AliasesTab,
  'food-data-prep-states': PrepStatesTab,
  'food-data-substitutions': SubstitutionsTab,
  'food-data-substitutions-graph': SubGraphPage,
  'food-data-conversions': ConversionsTab,
  'food-data-tags': TagsTab,
  'food-recipe-list': RecipeListPage,
  'food-recipe-new': RecipeNewPage,
  'food-recipe-detail': RecipeDetailPage,
  'food-recipe-version-detail': RecipeVersionDetailPage,
  'food-recipe-edit': RecipeEditPage,
  'food-recipe-drafts': RecipeDraftsPage,
  'food-recipe-draft-edit': RecipeDraftEditPage,
  'food-prompt-viewer': PromptViewerPage,
  'food-plan': PlanPage,
  'food-fridge': FridgePage,
  'food-solve': SolvePage,
  'food-shopping-from-plan': FromPlanPage,
  'food-inbox': InboxPage,
  'food-inbox-inspector': InspectorPage,
} satisfies Record<FoodPageSlot, ComponentType>;

export const routes: RouteObject[] = [
  { index: true, element: <FoodLandingPage /> },
  {
    path: 'data',
    element: <FoodDataLayout />,
    children: [
      { index: true, element: <DataIndexRedirect /> },
      { path: 'ingredients', element: <IngredientsTab /> },
      { path: 'aliases', element: <AliasesTab /> },
      { path: 'prep-states', element: <PrepStatesTab /> },
      { path: 'substitutions', element: <SubstitutionsTab /> },
      // Declared as a sibling under `data` (not nested under `substitutions`)
      // so the active-tab resolver in FoodDataLayout still highlights the
      // Substitutions tab while the graph subroute is open.
      // (pillars/food/docs/prds/substitution-graph-explorer)
      { path: 'substitutions/graph', element: <SubGraphPage /> },
      { path: 'conversions', element: <ConversionsTab /> },
      // Read-only vocabulary view; the per-ingredient chip editor lives inside
      // the Ingredients tab's detail panel.
      { path: 'tags', element: <TagsTab /> },
    ],
  },
  { path: 'recipes', element: <RecipeListPage /> },
  { path: 'recipes/new', element: <RecipeNewPage /> },
  { path: 'recipes/:slug', element: <RecipeDetailPage /> },
  { path: 'recipes/:slug/v/:versionNo', element: <RecipeVersionDetailPage /> },
  { path: 'recipes/:slug/edit', element: <RecipeEditPage /> },
  { path: 'recipes/:slug/drafts', element: <RecipeDraftsPage /> },
  { path: 'recipes/:slug/drafts/:draftNo', element: <RecipeDraftEditPage /> },
  { path: 'prompts', element: <PromptViewerPage /> },
  { path: 'plan', element: <PlanPage /> },
  { path: 'fridge', element: <FridgePage /> },
  { path: 'solve', element: <SolvePage /> },
  { path: 'shopping/from-plan', element: <FromPlanPage /> },
  { path: 'inbox', element: <InboxPage /> },
  // `:sourceId` opens the three-pane provenance / editor / decision inspector.
  { path: 'inbox/:sourceId', element: <InspectorPage /> },
];
