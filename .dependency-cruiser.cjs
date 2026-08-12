/**
 * dependency-cruiser config — module import boundary enforcement.
 *
 * Rules:
 * - pillars/<x>/app/** must not import from pillars/<y>/app/** (x ≠ y).
 *   Cross-pillar frontend communication goes through the pillar REST APIs
 *   or shared workspace packages.
 * - The retired per-pillar @pops/<pillar>-db / -contract / -api packages may
 *   not be re-imported (tombstone rules below); consumers go through the
 *   pillar's @pops/<pillar> entrypoint and its REST API.
 *
 * Shared workspace packages available to pillar frontends: @pops/ui,
 * @pops/navigation, @pops/types.
 *
 * See docs/architecture/adr-026-pillar-architecture.md (what a pillar owns),
 * adr-039-pillar-isolation.md (why isolation is enforced, not assumed) and
 * adr-040-cross-pillar-contract-discipline.md (how a pillar may consume a
 * sibling). The `ISO-R*` labels on the rules below are defined by the rules
 * themselves — they are not a doc reference.
 */
/**
 * A generated Hey API client directory (`src/<name>-api/`) and the hand-authored
 * runtime-config file the codegen is pointed at (`src/<name>-api-runtime-config.ts`).
 *
 * Every one of these is `@hey-api/openapi-ts` output regenerated wholesale from
 * an OpenAPI spec, plus the one file its `runtimeConfigPath` option forces to be
 * imported back. The import cycle between them is a property of that codegen
 * contract, not of authored structure, and no edit here can break it — the only
 * way out would be hand-editing generated output.
 */
const GENERATED_CLIENT = '(^|/)[a-z0-9-]+-api(/|-runtime-config\\.ts$)';

module.exports = {
  forbidden: [
    {
      name: 'lib-no-pillar-import',
      severity: 'error',
      comment:
        'ISO-R1: a lib facilitates pillars; it must never depend on one. Importing a pillar (by path under pillars/, or by its @pops/<pillar> contract package) inverts the dependency and blocks extraction — the lib could not build in its own repo without dragging a pillar in. A lib takes a pillar capability via injection/discovery at runtime, never a compile-time import.',
      from: { path: '^libs/' },
      to: {
        pathNot: '^libs/',
        path: [
          '^pillars/',
          // KNOWN_PILLAR_IDS (disk-derived; `core` is now `registry` post-rename):
          '^@pops/(ai|cerebrum|contacts|registry|docs|documents|finance|food|inventory|lists|mcp|media|moltbot|orchestrator|shell)(/|$)',
          '^@pops/app-',
        ],
      },
    },
    {
      name: 'pillar-no-cross-internal',
      severity: 'error',
      comment:
        'ISO-R2 (supersedes no-cross-app-import): a pillar may consume another pillar ONLY through its published contract package (@pops/<other>, resolved via that package exports map). Reaching into pillars/<other>/src|app|db|migrations by filesystem path is a behind-the-contract reach that breaks black-box isolation + extraction. Same-pillar imports are fine. The shell is carved out because it composes every pillar app by design — see `shell-no-cross-internal`, which holds it to the same standard with that one edge allowed.',
      from: { path: '^pillars/([^/]+)/', pathNot: '^pillars/shell/' },
      to: { path: '^pillars/[^/]+/', pathNot: '^pillars/$1/' },
    },
    {
      name: 'shell-no-cross-internal',
      severity: 'error',
      comment:
        "ISO-R2 (shell): the shell composes the single in-repo SPA (ADR-002) by importing every pillar's @pops/app-<id> package, so that one edge is allowed — but only as far as the exports map goes. Those packages point `main` at src/index.ts rather than a built dist/ (which every other pillar package does, and doNotFollow skips), which is the only reason this edge resolves into the cruised tree at all. Everything past the entrypoint is the reach ISO-R2 forbids: not another pillar's src|db|migrations, and not an app's pages or generated client either.",
      from: { path: '^pillars/shell/' },
      to: {
        path: '^pillars/[^/]+/',
        pathNot: ['^pillars/shell/', '^pillars/[^/]+/app/src/index\\.ts$'],
      },
    },
    {
      name: 'no-deep-internal-import',
      severity: 'error',
      comment:
        'ISO-R3: importing a subpath of a @pops/* package that its exports map does not declare is a behind-the-contract reach (e.g. @pops/finance/src/db, @pops/pillar-sdk/dist/internal). Consume only declared subpaths; add an exports entry if the surface is meant to be public.',
      from: {},
      to: { path: '^@pops/[^/]+/(src|dist|lib|internal)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'ISO-R4: cyclic dependency between units — a cycle means neither can be extracted independently. Generated Hey API clients are exempt: their cycles are a property of the codegen, and a directory regenerated wholesale from an OpenAPI spec extracts as one unit regardless.',
      from: { pathNot: GENERATED_CLIENT },
      to: { circular: true, pathNot: GENERATED_CLIENT },
    },
    {
      name: 'lib-layering',
      severity: 'error',
      comment:
        'ISO-R5: leaf libs (types, sdk, settings, ai-telemetry) must not import any other @pops/* lib — they are the extraction floor.',
      from: { path: '^libs/(types|sdk|settings|ai-telemetry)/' },
      to: {
        path: '^@pops/',
        pathNot: '^@pops/(types|pillar-sdk|pillar-settings|ai-telemetry)(/|$)',
      },
    },
    {
      name: 'no-dead-db-types-pkg',
      severity: 'error',
      comment:
        'The `@pops/db-types` package no longer exists — its cross-pillar literal-union constants (ENTITY_TYPES, MEDIA_TYPES, INVENTORY_CONDITIONS) moved into their owning pillar contract packages (`@pops/finance`, `@pops/inventory`), completing the ADR-026 retirement. Consumers go through the owning pillar contract package.',
      from: { path: '.*' },
      to: { path: '^@pops/db-types(/|$)' },
    },
    {
      name: 'no-dead-lists-pkgs',
      severity: 'error',
      comment:
        'The `@pops/app-lists-db`, `@pops/lists-db`, `@pops/lists-contract`, and `@pops/lists-api` packages no longer exist — lists collapsed into `pillars/lists/`. Consumers go through `@pops/lists` (contract types + api-types + openapi) and the lists REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-lists-db|lists-db|lists-contract|lists-api)(/|$)' },
    },
    {
      name: 'no-dead-inventory-pkgs',
      severity: 'error',
      comment:
        'The `@pops/app-inventory-db`, `@pops/inventory-db`, `@pops/inventory-contract`, and `@pops/inventory-api` packages no longer exist — inventory collapsed into `pillars/inventory/`. Consumers go through `@pops/inventory` (contract types + api-types + openapi) and the inventory REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-inventory-db|inventory-db|inventory-contract|inventory-api)(/|$)' },
    },
    {
      name: 'no-dead-food-pkgs',
      severity: 'error',
      comment:
        'Food has collapsed into `pillars/food/` — `@pops/app-food-db`, `@pops/food-db`, `@pops/food-contract`, `@pops/food-contracts`, and `@pops/food-api` are the retirement tombstone (deleted once the pops-api food module is gone). No new code may import them; consumers go through `@pops/food` (contract types + api-types + openapi) and the food REST API for cross-pillar calls. Existing pops-api food-module imports are grandfathered in the known-violations baseline until they are removed.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-food-db|food-db|food-contract|food-contracts|food-api)(/|$)' },
    },
    {
      name: 'no-dead-finance-pkgs',
      severity: 'error',
      comment:
        'The `@pops/app-finance-db`, `@pops/finance-db`, `@pops/finance-contract`, and `@pops/finance-api` packages are retired — finance collapsed into `pillars/finance/`. Consumers go through `@pops/finance` (contract types + api-types + openapi) and the finance REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-finance-db|finance-db|finance-contract|finance-api)(/|$)' },
    },
    {
      name: 'no-dead-cerebrum-pkgs',
      severity: 'error',
      comment:
        'Cerebrum has collapsed into `pillars/cerebrum/` — `@pops/cerebrum-db`, `@pops/cerebrum-contract`, and `@pops/cerebrum-api` are the retirement tombstone (deleted once the pops-api cerebrum module + pops-cerebrum-api are gone). No new code may import them; consumers go through `@pops/cerebrum` (contract types + api-types + openapi) and the cerebrum REST API for cross-pillar calls. Existing pops-api cerebrum-module imports are grandfathered in the known-violations baseline until they are removed.',
      from: { path: '.*' },
      to: { path: '^@pops/(cerebrum-db|cerebrum-contract|cerebrum-api)(/|$)' },
    },
    {
      name: 'no-dead-media-pkgs',
      severity: 'error',
      comment:
        'Media is collapsing into `pillars/media/` — `@pops/app-media-db`, `@pops/media-db`, `@pops/media-contract`, and `@pops/media-api` are the retirement tombstone (deleted once the pops-api media module is gone). No new code may import them; consumers go through `@pops/media` (contract types + api-types + openapi) and the media REST API for cross-pillar calls. Existing pops-api media-module imports are grandfathered in the known-violations baseline until they are removed.',
      from: { path: '.*' },
      to: { path: '^@pops/(app-media-db|media-db|media-contract|media-api)(/|$)' },
    },
    {
      name: 'no-dead-core-pkgs',
      severity: 'error',
      comment:
        'Core has collapsed into `pillars/registry/` (the pillar formerly named `core`) — `@pops/core-db`, `@pops/core-contract`, and `@pops/core-api` are the retirement tombstone (deleted in the 02 decommission). No new code may import them; consumers go through `@pops/registry` (contract types + api-types + openapi) and the registry REST API for cross-pillar calls.',
      from: { path: '.*' },
      to: { path: '^@pops/(core-db|core-contract|core-api)(/|$)' },
    },
    {
      name: 'no-dead-shared-schema-pkg',
      severity: 'error',
      comment:
        'The `@pops/shared-schema` package no longer exists — it shared the `entities` and `ai_inference_log` drizzle table definitions across core, finance, and food. Each pillar now owns a byte-compatible local copy of the table it persists (`pillars/<p>/src/db/schema/`), so pillars are self-contained black boxes with no cross-pillar schema dependency.',
      from: { path: '.*' },
      to: { path: '^@pops/shared-schema(/|$)' },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'dist'],
    },
    exclude: {
      path: ['node_modules', 'build', '\\.next', 'coverage', '/migrations/', 'drizzle\\.config\\.'],
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
