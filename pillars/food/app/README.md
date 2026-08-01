# @pops/app-food

Frontend module for the food pillar: recipes, ingredients, meal planning, and multimodal ingestion. It registers with the app shell under `/food` and renders entirely against the food and lists REST APIs.

The module is frontend-only. `manifest` declares `id: 'food'`, `surfaces: ['app']`, and a `frontend` slot carrying `routes` and `navConfig`; there is no backend slot. Data access goes through the generated REST clients in `src/food-api` and `src/lists-api` (hey-api fetch clients over each pillar's OpenAPI contract).

## Routes

`navConfig` mounts these sections under `/food`:

- `/food` — landing page
- `/food/recipes` — recipe list, detail, version history, create/edit, and drafts
- `/food/inbox` — ingest queue with a three-pane provenance/editor/decision inspector (`/food/inbox/:sourceId`)
- `/food/plan` — weekly meal plan
- `/food/fridge` — pantry batches
- `/food/solve` — cook solver
- `/food/shopping/from-plan` — shopping list generated from the plan
- `/food/data` — ingredient/alias/prep-state/substitution/conversion/tag curation, plus the substitution graph explorer
- `/food/prompts` — AI prompt viewer

## Layout

```
src/
  index.ts          public exports (manifest, navConfig, routes, DSL editor + renderer components)
  manifest.ts       ModuleManifest declaration (id='food')
  routes.tsx        routes + navConfig
  pages/            page components (lazy-loaded)
  components/        RecipeRenderer, DslEditor, IngredientChip, and shared UI
  dsl/              recipe-DSL helpers (renumber, scan)
  ai/               prompt registry
  jobs/             ingest job client
  storage/          hero-image and ingest path helpers
  food-api/         generated REST client for the food pillar
  lists-api/        generated REST client for the lists pillar
  test-setup.ts     vitest setup (jsdom + i18n)
```

The CodeMirror DSL editor (`DslEditor`), cookbook renderer (`RecipeRenderer`), and ingredient/timer/temperature widgets are exported for downstream stories and pages.

## Install gate

`POPS_APPS` controls whether the shell mounts this module. Listing `food` in the comma-separated set makes the shell pick up the manifest at boot; dropping it removes the routes (stored data is untouched).

## Develop

```sh
pnpm test                    # vitest run
pnpm test:watch              # vitest watch
pnpm test:coverage           # vitest run --coverage
pnpm typecheck               # tsc --noEmit
pnpm generate:food-client    # regenerate src/food-api from the food OpenAPI contract
pnpm generate:lists-client   # regenerate src/lists-api from the lists OpenAPI contract
```

## Docs

- Pillar overview: [`pillars/food/README.md`](../README.md)
