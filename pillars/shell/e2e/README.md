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

## What every spec has to stub

`helpers/pillar-rest.ts` covers the surfaces that are hit on _every_ page load,
whichever pillar a spec is about: the registry snapshot boot resolves the
install set from, the shell manifest `/` lands on, the pillar-health aggregator,
and federated search. Leaving any of them unstubbed does not fail — each soft-
fails to a fallback, so the spec still passes, against the fallback path rather
than the one it meant to test. `stubShellBoot(page)` is the default; take the
registry off the air with `failRegistry(page)` when the fallback IS the subject.

Its route patterns are anchored regexes rather than `**` globs on purpose. `**`
spans `/`, so a glob for the pillar-boot endpoint `/pillars` also swallows
`/registry-api/registry/pillars`, and Playwright serves the most recently
registered match — which silently fed the boot resolver the wrong body.

## Two shells, two projects

`playwright.config.ts` boots two Vite dev servers so one run can cross the
build-time install-set boundary: `chromium-all-modules` against the canonical
workspace registry, and `chromium-finance-only` against a snapshot built with
`POPS_APPS=finance,core`. Only `pops-apps-finance-only-*.spec.ts` runs against
the second.

The finance-only server builds that snapshot first, which discovers every
pillar's `./manifest` export from its built `dist/`. So a local run needs every
pillar built, not just the shell's dependency closure:

```sh
pnpm --filter "./pillars/*" --filter "@pops/shell^..." build
pnpm --filter @pops/shell test:e2e
```

## Timeouts

Specs carry none. The single deadline is `expect.timeout` in the config, and
its justification is there. An assertion that needs longer than its neighbours
is racing something it should be awaiting instead — fix the wait, not the
number.
