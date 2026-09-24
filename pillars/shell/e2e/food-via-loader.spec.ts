/**
 * The food pillar, mounted through the shell's runtime loader (POPS-3222).
 *
 * food is the first pillar whose route table nests: eight `data` tabs beneath
 * a layout whose element renders the tab chrome around an `<Outlet/>`. That
 * shape is what POPS-3256 taught the wire to carry, and this is the only tier
 * that can show it survived the round trip — a flattened tree still renders a
 * tab, it just rebuilds the chrome underneath it every time.
 */
import { z } from 'zod';

import { expect, test } from './fixtures/pillar-rest-guard';
import { fulfilWith, stubShellBoot } from './helpers/pillar-rest';

/**
 * `GET /substitutions/graph-view` 200 — mirrors `GraphViewSchema`
 * (`pillars/food/src/contract/rest-substitutions.ts`). Hand-mirrored rather
 * than imported for the reason `media-library-search-add-movie.spec.ts`
 * gives: `shell-no-cross-internal` keeps another pillar's contract package
 * out of reach from here.
 */
const GraphViewSchema = z
  .object({
    nodes: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(['ingredient', 'variant']),
          ingredientId: z.number().int(),
          variantId: z.number().int().nullable(),
          ingredientSlug: z.string(),
          ingredientName: z.string(),
          variantSlug: z.string().nullable(),
          variantName: z.string().nullable(),
        })
        .strict()
    ),
    edges: z.array(
      z
        .object({
          id: z.number().int(),
          fromNodeId: z.string(),
          toNodeId: z.string(),
          ratio: z.number(),
          contextTags: z.array(z.string()),
          scope: z.enum(['global', 'recipe']),
          recipeId: z.number().int().nullable(),
          recipeSlug: z.string().nullable(),
          notes: z.string().nullable(),
        })
        .strict()
    ),
  })
  .strict();

const GRAPH_VIEW = {
  nodes: [
    {
      id: 'i:1',
      kind: 'ingredient',
      ingredientId: 1,
      variantId: null,
      ingredientSlug: 'butter',
      ingredientName: 'Butter',
      variantSlug: null,
      variantName: null,
    },
    {
      id: 'i:2',
      kind: 'ingredient',
      ingredientId: 2,
      variantId: null,
      ingredientSlug: 'margarine',
      ingredientName: 'Margarine',
      variantSlug: null,
      variantName: null,
    },
  ],
  edges: [
    {
      id: 1,
      fromNodeId: 'i:1',
      toNodeId: 'i:2',
      ratio: 1,
      contextTags: [],
      scope: 'global',
      recipeId: null,
      recipeSlug: null,
      notes: null,
    },
  ],
};

test.describe('food — mounted by the runtime loader', () => {
  test.use({
    allowUnroutedPillarRest:
      'every assertion here is about the route table surviving the wire — a ' +
      'URL, a tab nav, a mounted page — and only the graph reads a body. ' +
      'The tabs that do mount a data page fire food-api reads (ingredients, ' +
      'conversions/units, conversions/weights); stubbing them would assert ' +
      "the food app's own data flow, which is that pillar's tests' job",
  });

  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await stubShellBoot(page);
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(errors).toHaveLength(0);
  });

  test('the rail carries food and its landing page renders from the remote bundle', async ({
    page,
  }) => {
    await page.goto('/food');

    await expect(page.getByRole('button', { name: 'Food', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByRole('navigation', { name: 'Food pages' })).toBeVisible();
  });

  /**
   * The nesting claim. `/food/data` has no page of its own — the layout's
   * index child redirects to the first tab — so landing on the ingredients
   * tab is only possible if the child mounted beneath the layout rather than
   * beside it.
   */
  test('the data layout mounts its index child, landing on the first tab', async ({ page }) => {
    await page.goto('/food/data');

    await expect(page).toHaveURL(/\/food\/data\/ingredients/);
  });

  test('a named data tab mounts under the same layout', async ({ page }) => {
    await page.goto('/food/data/conversions');

    await expect(page).toHaveURL(/\/food\/data\/conversions/);
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  });

  /**
   * A route two levels deep and reachable from nothing on the rail — the kind
   * most easily dropped from the page list, and the kind whose absence shows
   * up as a 404 rather than as anything visibly broken.
   *
   * The canvas is the assertion, not the absence of the load-error testid.
   * The bundle loading is not the page mounting: when the page's chunk
   * imported a `@pops/ui` subpath the import map could not resolve, the
   * loader succeeded, the page's error boundary rendered, and a load-error
   * check passed over it (POPS-4034).
   */
  test('the substitutions graph subroute mounts and draws the graph', async ({ page }) => {
    await page.route(
      /\/food-api\/substitutions\/graph-view(\?|$)/,
      fulfilWith(200, GraphViewSchema, GRAPH_VIEW, 'substitutions.graphView')
    );

    await page.goto('/food/data/substitutions/graph');

    await expect(page).toHaveURL(/\/food\/data\/substitutions\/graph/);
    const graph = page.getByRole('img', { name: 'Substitution graph canvas' });
    await expect(graph.locator('canvas')).toBeVisible();
  });
});
