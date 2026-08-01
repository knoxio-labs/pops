# Recipe DSL

Parser, resolver, cycle detector and compiler for the recipe authoring language
(grammar: `docs/architecture/adr-023-recipe-markdown-dsl.md`). Each stage's
mechanics are on its own file header; `compile.ts` documents the pipeline order.
What follows is only the part that spans the pillar.

## Compile is explicit, and it owns three columns

Nothing auto-compiles. `compileRecipeVersion` has exactly two direct callers,
`api/modules/recipes/save.ts` and `api/modules/recipes/create.ts`, plus the
seeder, which takes it as an injected callback (`seed/index.ts` →
`seed/step-recipes.ts`, supplied by `scripts/db-seed-food.ts`). A version written
by any other path — notably the ingest worker's draft, via
`api/modules/ingest/ingest-worker-complete.ts` — stays `uncompiled` until someone
saves it.

`recipe_versions.compile_status`, `compile_error` and `compiled_at` are written
**only** by this directory. Do not set them from a service or handler.

## The invariant every reader of compiled rows depends on

A version that is not `compile_status='compiled'` has zero `recipe_lines` and
zero `recipe_steps` — the failure writers in `compile-finalise.ts` clear both.
There is no DB constraint enforcing this; it holds because compile is the single
writer.

The promote and cook paths guard up front and refuse
(`CannotPromoteUncompiledVersion`, `CannotCookUncompiledRecipe` in
`db/errors.ts`).
