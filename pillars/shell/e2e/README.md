# Shell E2E

Playwright over the shell and the pillar app bundles it mounts. Run by
`.github/workflows/fe-test-e2e.yml` on every pull request that touches the
shell, a pillar app, or one of the shared FE libs.

## No backend runs

There is no seeded database, no pillar process, and no seeding step. Every spec
fulfils the REST surface it exercises at the shell's `/<pillar>-api` proxy path
with `page.route`, and the bodies it returns are the plain REST shapes the
generated Hey API clients unwrap — no envelope.

That is a deliberate trade and it bounds what this suite can claim. It proves
the shell asks the documented endpoint for the right thing and renders what
came back; it proves nothing about whether the pillar would actually answer
that way. Contract fidelity is the pillar's own tests' job, and the generated
clients are regenerated from each pillar's OpenAPI projection, so a shape that
drifts fails there first.

The one exception is `*.acceptance.spec.ts`: the inventory-types acceptance
spec boots a real registry and inventory itself
(`helpers/inventory-acceptance-stack.ts`) and forwards `/inventory-api/*` to
them. The default config ignores it; it runs only through
`playwright.acceptance.config.ts` under `INVENTORY_ACCEPTANCE=1`, which
`mise run inventory:acceptance -- --web` sets.

## What every spec has to stub

`helpers/pillar-rest.ts` covers the surfaces that are hit on _every_ page load,
whichever pillar a spec is about: the registry snapshot boot resolves the
install set from, the shell manifest `/` lands on, the pillar-health aggregator,
the top-bar nudge poll, and federated search. `stubShellBoot(page)` is the
default; take the registry off the air with `failRegistry(page)` when the
fallback IS the subject.

Its route patterns are anchored regexes rather than `**` globs on purpose. `**`
spans `/`, so a glob for the pillar-boot endpoint `/pillars` also swallows
`/registry-api/registry/pillars`, and Playwright serves the most recently
registered match — which silently fed the boot resolver the wrong body.

## An unstubbed pillar REST call fails the test

Every spec's `test`/`expect` come from `./fixtures/pillar-rest-guard`, not
`@playwright/test` directly. The fixture installs a context-level catch-all
for the pillar REST URL pattern (`PILLAR_REST_URL` in
`helpers/pillar-rest.ts`). Page-level stubs take precedence, and the
context-level fallback survives a spec's `page.unrouteAll()` cleanup. A
request nothing more specific claims is recorded and fulfilled with a 599;
the fixture reports every recorded method and URL after the page settles.
The registry-health test response also uses context routing so page cleanup
does not forward background health checks to the unavailable backend.

The guard regression can declare exact expected fallback calls with
`expectedUnroutedPillarRestCalls`; teardown compares the captured method and
path/query list exactly, so that test still fails if another unmatched request
appears. It also verifies that a page-level stub wins before `page.unrouteAll()`
and that the context fallback catches the request afterward.

When a script or pillar REST request is still in flight after a test and its
hooks finish, teardown waits for the tracked requests to finish and then for
100ms without another relevant request. The event-driven wait has a five-second
upper bound. Tests with no recent script or pillar REST request do not wait,
and a page that fails to settle within the bound fails with its remaining
requests listed.

A spec whose actual subject is the shell's behaviour when a pillar answers
nothing (a rail-navigation smoke test, a "mounts even with a dead API" case)
opts out with `test.use({ allowUnroutedPillarRest: '<why>' })`, scoped as
narrowly as the resilience claim itself — see `shell-navigation.spec.ts` for
a file-wide example and `ai-via-loader.spec.ts` for a single-test one.
Anywhere else, an unrouted call means a missing stub, not a reason to opt out.

## Two shells and Storybook, three projects

`playwright.config.ts` boots two shell Vite dev servers so one run can cross
the build-time install-set boundary: `chromium-all-modules` against the
canonical workspace registry, and `chromium-finance-only` against a snapshot
built with `POPS_APPS=finance,core`. Only `pops-apps-finance-only-*.spec.ts`
runs against the second. The `chromium-ui-storybook` project runs targeted
browser interaction checks against the shared UI library's Storybook, currently
covering the expanded remove-button hit areas on wrapped and clickable chips.

The finance-only server builds that snapshot first from the public
`@pops/module-registry` exports: `KNOWN_MODULES` keeps the full id set,
`MODULES` supplies the generated manifest rows, and `INSTALLED_MODULES` applies
the finance-only environment. The snapshot no longer walks each pillar's
built manifest. The all-pillar build below remains necessary to supply the
remote app bundles served by the shell's E2E servers:

```sh
pnpm --filter "./pillars/*" --filter "@pops/shell^..." build
pnpm --filter @pops/shell test:e2e
```

## Timeouts

Specs carry none. The single deadline is `expect.timeout` in the config, and
its justification is there. An assertion that needs longer than its neighbours
is racing something it should be awaiting instead — fix the wait, not the
number.
