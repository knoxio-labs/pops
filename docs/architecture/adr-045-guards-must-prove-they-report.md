# ADR-045: A guard ships with a test proving it reports

## Status

Accepted — 2026-08-09.

## Context

Five independent guards in this repo, written by three authors in the same week, shared one defect: **each reported success under exactly the condition it was built to detect.** All five were green on CI. None was caught by anything except a reviewer reading the error paths.

- `.github/workflows/ci-gate.yml` published `conclusion: "success"` whenever nothing had yet _failed_ — including while gated workflows were still in flight.
- `scripts/ci/check-ci-gate-wiring.mjs` recorded "the `Quality` workflow name is missing", then dereferenced the filename it had just proved absent, crashing instead of printing the violation list it had already built.
- The same file's path-filter check was anchored `/^\s{4}paths(-ignore)?:\s*$/u`, which matches only the block form. The repo already writes the inline form, so a filter added to `Quality` would have slipped past in silence.
- The iOS token-discipline scanner collapsed every filesystem error into "no Swift source found" with `try?`. A scan that found nothing **passed**.
- The same scanner's `isDirectory` probe dropped a failing entry from both the roots list _and_ the unclassified bucket, so the bucket built to catch gaps could not see its own.

Three authors producing the same bug independently makes it a property of how guards get written here, not three careless mistakes. Two mechanisms recur:

1. **Error-swallowing on discovery.** `try?`, `catch {}`, `?? false`, or an `existsSync` skip on the step that _finds_ the subject, so an empty result is indistinguishable from a clean result. Every guard whose body is `for (const x of discover()) { … }` inherits this: zero subjects means zero violations means exit 0.
2. **Over-anchored matching on structured config.** A regex anchored at end-of-line after a key sees only the block form; an indent-exact match breaks on reformatting; a hand-rolled state machine over YAML or TOML models one spelling of a format that has several. The subject stays valid, the guard stops seeing it, and nothing says so.

Both mechanisms fail **silently and in the passing direction**. That is what distinguishes them from ordinary bugs: a guard that crashes gets fixed the same day, and a guard that over-reports gets fixed the same hour. A guard that under-reports is indistinguishable from a healthy repo, and can stay broken indefinitely — the five above were found by a review sweep, not by CI.

Several guards already accept `--self-test`, run as a preflight step in `.github/workflows/agent-review.yml` before the guard itself. That convention is the right hook and it is already load-bearing. But of the guards under `scripts/` today, nearly every self-test plants a violation and asserts it is caught. Almost none removes, renames, or corrupts the subject and asserts the guard refuses to pass. `scripts/ci/check-device-signature-fixture.mjs` is the exception worth copying: it self-tests a deleted copy and a reformatted copy, and it guards its own preconditions rather than assuming them.

## Options Considered

| Option                                                     | Pros                                                                                                                             | Cons                                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix each instance as review finds it                       | No new rule; nothing to enforce                                                                                                  | This _is_ the status quo, and it produced five instances in one week. Review found them by luck of who read the error paths                                 |
| Require a degenerate-case test alongside the positive case | Cheap — one more case in a self-test that already exists; makes the defect impossible to land unnoticed rather than easy to spot | Cannot be enforced mechanically without a guard-for-guards, which would need the same proof and start the regress                                           |
| Ban hand-rolled config parsing outright                    | Deletes mechanism 2 as a class rather than patching instances                                                                    | Several guards run before `pnpm install` by design, so no parser is on disk when they execute. A blanket ban would force a CI restructure it cannot pay for |
| Assert a discovery floor and nothing else                  | One line per guard, catches the common shape                                                                                     | Catches total discovery loss only. Partial loss — one unit dropped out of twelve — still passes                                                             |

## Decision

**A guard ships with a test proving it _reports_, not merely that it passes.**

Concretely, for every script under `scripts/` whose job is to fail the build on a repo invariant:

- **The degenerate case is a required test case.** The subject missing, renamed, moved, or malformed must produce a deterministic violation — never a crash, never silence. The positive case (a planted violation is caught) is necessary and not sufficient; a self-test that proves only the positive case proves the guard is loud when it can see, not that it can see.
- **Discovery asserts a floor.** A guard that iterates a discovered set fails when the set is empty and the repo says it should not be. "Found nothing" is a finding, and it prints as one — not as `OK`.
- **Errors on the discovery path surface.** No bare `catch {}`, `try?`, or `?? false` between finding the subject and reporting on it. Where a failure genuinely must be tolerated (a shallow clone with no merge base, say), the guard prints a distinct message that is not its success message, and the reason lives in the file header.
- **A shape the guard does not model is a violation, not a pass.** When a matcher cannot decide, it reports. Silence is reserved for "I looked and it is fine".
- **Structured config is parsed, not scanned.** YAML, TOML, and JSON go through a real parser where one is reachable. Where it is not — see the constraint below — the file header states why, and the degenerate-case test covers the spellings the hand-rolled matcher does not model.
- **The `--self-test` flag is where this lives** for a guard that has one, so `agent-review.yml`'s preflight step is the thing that catches a guard which has quietly stopped catching anything. A guard with a Vitest suite under `scripts/__tests__/` or `scripts/ci/__tests__/` may carry the degenerate cases there instead, but not in neither.
- **The test is watched failing against the unfixed guard.** A test that has never been red is not evidence.

**The stated exception to real-parser use.** — _Resolved by the amendment below; kept because it is the context the amendment answers._ `agent-review.yml` and several jobs in `.github/workflows/quality.yml`, `.github/workflows/rust-quality.yml`, and `.github/workflows/docker-build.yml` run their guards immediately after `actions/checkout` with **no `pnpm install`** — deliberately, so the gate answers in seconds and cannot be broken by a dependency problem it is supposed to be independent of. A guard in one of those jobs has no `node_modules` at execution time and therefore cannot import a parser. That constraint, not preference, is why hand-rolled YAML and TOML matchers exist here. It is recorded rather than defended: it trades a parser for latency, and the trade should be revisited as a unit rather than eroded one guard at a time.

## Consequences

- Writing a guard costs one more test case. That is the whole price, and it is paid once per guard.
- The failure mode this ADR targets stops being invisible. A guard whose discovery breaks now fails its own self-test in `agent-review.yml`'s preflight rather than reporting `OK` on a repo it can no longer see.
- **Accepted trade-off: this is a convention, not a gate.** A guard-for-guards would need to prove it reports, which is the same problem one level up. Enforcement is review plus the self-test preflight, and both can be bypassed by not writing the case at all.
- **Accepted trade-off: a discovery floor catches total loss, not partial.** A guard that discovers eleven of twelve units still passes. Where the exact set is knowable, pinning it (as `scripts/ci/__tests__/check-generated-clients.test.ts` pins its target count) is stronger than a floor, and preferred where it is cheap.
- The no-install constraint is now written down with the guards it shapes, so the next author reaching for a parser learns why the file next door does not use one — rather than concluding the hand-rolled matcher is the house style and copying it. Copying it is how one of the five instances above happened.

## Amendment — 2026-08-10: guard jobs are split into two tiers

The constraint above was recorded and deliberately not resolved. This resolves it.

**A guard job that needs a YAML or TOML parser gets `pnpm install --frozen-lockfile` with `cache: pnpm`. A guard job whose guards read JSON, plain text or source code keeps the install-free fast path.** The tier is a property of the JOB, because the install is: a job's steps share one workspace, so every guard in a job that installs has a parser available whether it wants one or not.

The alternative to splitting was to pick one rule for the whole fleet. Installing everywhere costs the fast gates their whole point — a guard that reads a JSON fixture and compares bytes gains nothing from `node_modules` and loses the property that it cannot be broken by a dependency problem. Installing nowhere keeps a defect class that has now produced five instances by hand-rolling a format that has several legal spellings of the same declaration. Neither is worth paying fleet-wide.

### Tier A — install-free

Runs immediately after `actions/checkout`. **No third-party import, at any depth.** Each of these owns exactly one guard, so the tier is also the job.

| Guard                                            | Job                                         | Reads                                                         |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| `scripts/check-bundle-map-coverage.mjs`          | `quality.yml` → `bundle-map-coverage`       | TSX source, `package.json`                                    |
| `scripts/check-tailwind-source-coverage.mjs`     | `quality.yml` → `tailwind-source-coverage`  | CSS `@source` globs, source file paths                        |
| `scripts/check-escape-hatches.mjs`               | `quality.yml` → `escape-hatches`            | TS/TSX source, JSON baseline                                  |
| `scripts/ci/check-control-characters.mjs`        | `quality.yml` → `control-characters`        | Every tracked file, raw bytes                                 |
| `scripts/ci/check-design-tokens.mjs`             | `quality.yml` → `design-tokens`             | Frontend TS/TSX/CSS source, class strings                     |
| `scripts/ci/check-vendored-contracts.mjs`        | `quality.yml` → `vendored-contracts`        | OpenAPI JSON, byte comparison, consumer codegen config source |
| `scripts/ci/report-contract-consumers.mjs`       | `quality.yml` → `contract-consumers`        | The same, plus `package.json` and a `mise.toml` task name     |
| `scripts/ci/resolve-report-base.mjs`             | `quality.yml` → `contract-consumers`        | `git merge-base` against a caller-supplied ref name           |
| `scripts/ci/check-device-signature-fixture.mjs`  | `quality.yml` → `device-signature-fixture`  | JSON fixture, `node:crypto`                                   |
| `scripts/ci/check-cross-pillar-expectations.mjs` | `quality.yml` → `cross-pillar-expectations` | OpenAPI JSON, TS source                                       |
| `scripts/ci/check-litestream-sidecar-parity.mjs` | `infra-lint.yml` → `sidecar-parity`         | Litestream filenames, Compose text                            |
| `scripts/ci/check-icon-dynamic-import.mjs`       | `quality.yml` → `icon-dynamic-import`       | TS/TSX/JS/MJS/CJS source under `pillars/`, `libs/`            |

`report-contract-consumers.mjs` reads one TOML key with a hand-rolled matcher and stays in Tier A, which is a stated exception rather than an erosion of the rule above. The rule exists because a matcher that stops seeing a declaration makes a gate report `OK` over a repo it can no longer read. Nothing here is a verdict: that read only turns "see the declaring file" into "run this exact task", the matcher returns `null` for every shape it does not model, and the caller prints the vaguer line. Moving a reporting job to Tier B for a cosmetic upgrade would cost it the install-free property for nothing. A future assertion built on that read is the point at which the job moves.

### Tier B — installs the workspace

| Guard                                            | Job                                                       | Reads                                          | Parser                 |
| ------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| `scripts/ci/check-mise-tool-overrides.mjs`       | `agent-review.yml` → `agent-review`                       | `mise.toml` `[tools]`                          | `smol-toml`            |
| `scripts/ci/check-node-pin.mjs`                  | `agent-review.yml` → `agent-review`                       | `mise*.toml`, workflow YAML, JSON, Dockerfile  | `smol-toml`, `js-yaml` |
| `scripts/ci/check-homelab-service-isolation.mjs` | `agent-review.yml` → `agent-review`                       | Compose + Litestream YAML                      | `js-yaml`              |
| `scripts/extractability/check-cargo-deps.mjs`    | `rust-quality.yml` → `quality`                            | Workspace + member `Cargo.toml`                | `smol-toml`            |
| `scripts/ci/smoke-image.mjs`                     | `docker-build.yml` → `docker-build`                       | `infra/docker-compose.yml`                     | `js-yaml`, `zod`       |
| `scripts/ci/check-ci-gate-wiring.mjs`            | `quality.yml` → `Scripts tests`                           | Every workflow's YAML                          | `js-yaml`              |
| `scripts/ci/merge-group-scope.mjs`               | `ios-quality.yml` → `scope`, `docker-build.yml` → `scope` | The calling workflow's `on.pull_request.paths` | `js-yaml`              |

`check-ci-gate-wiring.mjs` has no workflow step of its own — it runs through its Vitest suite, in a job that already installs. It was already effectively Tier B and needed no workflow change.

Two shared modules sit under Tier B and must never be imported from a Tier A guard: `scripts/ci/config-parse.mjs` (the parsers, plus the parse-or-report rule) and `scripts/ci/compose-schema.mjs` (the `zod` shape of `infra/docker-compose.yml`, shared by `smoke-image.mjs` and the Cloudflare Access env check). They are libraries, not checks, and the derived test asserts neither is ever invoked by a workflow as a guard.

`check-homelab-service-isolation.mjs` parses Compose and deliberately does **not** use `compose-schema.mjs`. The schema describes one file for callers that need named fields out of it. The guard sweeps every compose-shaped file in the tree, must report rather than reject a document it does not recognise, and looks for `image` and `container_name` — two keys that shape does not model and a `zod` object would strip, leaving the guard scanning nothing and printing `OK`.

### Tier A guards that ride in a Tier B job

`agent-review.yml` runs nine guards in one job. Four of them are Tier B, so the job installs, and the other five get an install they do not need:

`check-lib-no-pillar-import.mjs`, `check-contract-isolation.mjs`, `check-known-pillars-coverage.mjs`, `check-tests-typechecked.mjs`, `check-docs-model.mjs`.

Splitting them into a second job was considered and rejected: `agent-review` is a **required context** on `main`, and only one job can carry that name. Whichever half kept the name would be the half that blocks, and the other half would silently become advisory — a guard that no longer gates is worse than a guard that waits thirty seconds for a cached install.

`check-docs-model.mjs` is the interesting one, and the reason "reads YAML" is not the test. It reads **comments** out of `.yml` and `.toml` files, looking for doc paths that no longer resolve. A parser discards comments. Routing that guard through `js-yaml` would not improve it; it would blind it.

### How the split is kept honest

`scripts/ci/__tests__/guard-job-tiers.test.ts` derives each job's tier rather than reading a declaration. It copies `scripts/` somewhere with no `node_modules` above it and **loads every Tier A guard for real**, failing on anything Node cannot resolve. The sandbox proves itself first: a known Tier B guard must fail to load in it, or the whole suite is passing over a sandbox that can still reach the workspace.

That is the mechanism that answers the question this amendment exists for — "which guards import a parser and which do not" — without anybody having to keep a list correct.

### Consequences

- **The `agent-review` gate is no longer seconds-scale.** It now pays a cached `pnpm install`. That is the price of the split and it was accepted knowingly; the six install-free jobs in `quality.yml` keep the fast path.
- **A Tier A job is one `import` away from a broken required check**, and that break lands on every subsequent PR rather than on the one that caused it. The derived test is what makes that a red build on the PR that caused it instead.
- **`scripts/ci/yaml-text.mjs` is deleted.** It existed only because a parser was unreachable; both of its consumers are Tier B now. `scripts/ci/config-parse.mjs` replaces it and owns the two rules that survive the migration: a document that does not parse is a violation, and a key is found by walking the parsed document rather than by matching a line.
- **"Report a shape you cannot model" still applies**, and now bites in a different place. The matchers could not model a flow mapping; a parser can. What a parser cannot do is read a document that is not valid YAML or TOML, so that is the case each Tier B guard reports — and each one's `--self-test` covers it.
