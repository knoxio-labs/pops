# .github/workflows

Every workflow YAML file in this directory is documented here exactly once: as a row in [The rest](#the-rest) below, or — where a row is not enough — under its own `##` section. The sectioned ones are `ci-gate.yml` and the two reusable `workflow_call`-only helpers no event triggers on its own, `_discover-units.yml` and `_extractability-sandbox-matrix.yml`. `scripts/ci/__tests__/workflow-readme-coverage.test.ts` asserts that split against disk, so a new workflow cannot land undocumented and a deleted one cannot leave a row behind. Every job runs on `ubuntu-latest` except the build job of `ios-quality.yml` and `ios-testflight.yml`, which need macOS to compile Swift at all.

## `ci-gate.yml` — the one static aggregate context

`ci-gate.yml` observes requested, in-progress and completed runs of nine quality
workflows. Additional workflows may opt into cancellation-only observation: add
their existing name to both the trigger and `cancellationOnly`, with a separate
observer concurrency group. Their verdict belongs to their own required check.
The wiring guard requires every observed name to exist and keeps the two sets
disjoint. It publishes an explicit `CI Gate` check against the observed head SHA;
its own implicit check belongs to the default branch. The workflow never checks
out or executes pull request content despite holding `actions: write` and
`checks: write`.

- Quality concurrency groups include the PR head SHA, so a new push registers
  without waiting for obsolete work. Native cancellation stays disabled.
- After a replacement is registered and verified against the current open PR,
  the observer cancels older runs of that same workflow, PR and source repository.
  Each evaluation reconciles every registered replacement at the current head,
  including completed replacements, so coalesced observer events cannot strand old work.
  Merge-group runs are never cancelled by this mechanism. If cancellation fails,
  obsolete work may finish, but it cannot contribute to another SHA's verdict.
- Validation jobs and the promotion terminal use `!cancelled()` when they must
  survive failed or skipped dependencies. Scope predicates still apply, and
  admission still rejects failed or skipped required lanes. Unlike job-level
  `always()`, this lets superseded runs stop and release runner capacity after
  cancellation; cleanup steps such as report uploads keep their own conditions.
  See [GitHub workflow cancellation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation).
- Cancellation-only and non-PR events have separate observer concurrency groups,
  so their no-verdict evaluations cannot replace a queued admission publication.
- Gate evaluations for one SHA serialize without cancelling each other's API
  publications. Every evaluation reads current sibling states. Pushes during
  evaluation, closed PRs and completions from superseded heads publish nothing.
- All nine workflows retrigger on PR edits, including base retargets. Title and
  description edits also rerun checks; there is no event filter for base-only edits.
- Only PR and merge-group events publish admission verdicts; a manual dispatch
  or main push cannot overwrite a PR verdict on the same SHA.
- Fork runs with empty PR associations resolve through the commit-to-PR API,
  matching source repository, branch and head. Admission then requires a run title
  that records the target base explicitly; a missing or older base stays pending.
  Workflow identity comes from its registered ID, because the run API may put a
  custom title in both `name` and `display_title`. Every registered workflow records
  its event and target branch in that title. Ambiguous
  associations block, and cancellation requires an explicit PR association.
- Only runs for the same event, PR and base branch contribute; the latest run
  number and attempt wins. Completed runs pass only on `success` or `skipped`.
  Cancellations, unknown conclusions and failures block. Rerunning a failed
  workflow replaces that attempt and can restore a green gate.
- Missing PR runs pass only for a confirmed path-filter exclusion. An unknown or
  truncated diff, a matching filter, or an unfiltered workflow remains pending.
  Every workflow is expected on a merge group, regardless of path filters.
- A registered but unfinished run holds the check at `in_progress`. The observer
  includes its triggering registration even if the run-list API has not caught
  up. Missing expected runs require retriggering; absence never means success.
- The run title identifies the evaluated SHA and branch. Actions lists attribute
  these observer runs to the default branch; read the explicit check for the
  actual PR verdict.

Checks attach to a SHA, not a PR. Concurrent PRs with identical heads and different
bases share that check context. A merge queue validates a distinct combined SHA
and avoids that collision. Without one, a promotion needs its own unique candidate
SHA and required checks against the current main; the PR verdict alone cannot
isolate shared-head PRs.

### Rules this file exists to stop people relearning

**A `workflow_run` job's implicit check run lands on the default branch's tip,
not on the head it judged.** Until the gate began POSTing its own check run it
had never once appeared on a pull request, however green or red it was. If the
`checks.create` call is ever dropped, the gate silently reverts to being a
post-hoc signal on `main`.

**The run itself is filed under the same misattribution, and POSTing the check
run does not fix it.** `gh run list --branch main` (and the Actions UI) always
attribute a `workflow_run` run to the default branch's tip, never to
`github.event.workflow_run.head_sha` — so a `CI Gate` run that fails while
evaluating an unrelated PR branch still reads as a red `CI Gate` on `main`'s
run list. Example: a run filed at `ea478a403` (main's tip) whose log read
`Triggered by "iOS Quality" (conclusion=failure) at 04773d252` — a commit on an
unrelated PR branch; every gated workflow at `ea478a403` itself had passed. The
gate evaluated and published correctly; only the run's own place in the list
was wrong. `run-name` (above) puts the evaluated SHA and branch in the run's
title so this is visible without opening the log, but the run's status column
still means "the commit named in this run's title", never "the branch column
next to it" — **`gh run list` is never the authoritative source for a commit's
gate state.** That is always the check run itself:

```
gh api repos/knoxio-labs/pops/commits/<sha>/check-runs \
  --jq '.check_runs[] | select(.name=="CI Gate")'
```

**"Not in the ruleset" does not mean "cannot block".** The gate aggregates the
**workflow-level** conclusion of each gated workflow, so one red job anywhere in
`quality.yml`, `unit-quality.yml`, … turns the single `CI Gate` context red
regardless of that job's own name. The only way to make a job advisory is
`continue-on-error: true`, which erases it from its workflow's conclusion; a
comment claiming a job is non-blocking because the ruleset does not list it by
name is wrong. Nothing in `quality.yml` is advisory today.

**Green must mean "everything finished and passed", not "nothing has failed
yet".** The gate fires on each sibling's completion, so the earliest evaluation
sees seven workflows still running. Concluding `success` there would put the
context green — and, once it is required, the PR mergeable — minutes before the
slowest gated workflow has an opinion, and the failure would land after the
merge. Hence `in_progress` until nothing is pending.

**A guard must be exercised against the condition it exists to detect, not
against a healthy tree.** Everything above shares one shape — a check that
looked fine precisely because it was never put in the state it was built for.
The implicit check run was green on `main` while judging nothing. A premature
`success` was green while seven workflows were still running. The wiring guard
threw a `TypeError` instead of reporting when `Quality` was renamed. And it
matched keys with regexes anchored at end-of-line, so every one of them was
blind to an inline value or a trailing comment — including the
`paths: ["**"] # …` form this repo already uses in `unit-quality.yml`, meaning a
path filter added to `Quality` that way would have slipped straight past. Green
from a check that was never made to fail is not evidence.

Concretely: **do not match workflow YAML by text.** `key:`, `key: value`,
`key: value # note` and `on: { key: value }` are all the same declaration, and a
matcher written against one of them silently matches nothing and reports
success — that is how three separate fixes to the wiring guard each closed one
spelling and left the next. The guard now parses with `js-yaml` and walks the
document, so the spellings collapse before it looks at them. What it still
matches textually is the `gated` array and the two `checks.create` invariants,
because those live in the embedded `github-script` body — JavaScript inside a
YAML scalar, which the parser hands over exactly.

`scripts/ci/check-ci-gate-wiring.mjs` asserts the rules above, plus the
trigger/`gated` agreement and that every gated name still resolves to a real
workflow. It runs in `quality.yml`'s `Scripts tests` job, which installs the
workspace — see the tier amendment in
[ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md) for
which guard jobs may import a parser and which may not.

### Current state of the ruleset

The `main` branch ruleset requires `agent-review`, `Lint`, `Format`,
`Module boundaries`, `Duplication check` **and `CI Gate`** — so every typecheck,
test, build, clippy, exports, extractability, bundle-map, drift and Docker
image-smoke job now blocks a merge through that one aggregated context, even
though none of them is listed by name. That only stays safe while `Quality`
stays gated and unfiltered: it is what guarantees the context reports on every
PR, docs-only ones included, and a required context that never reports blocks
its PR forever.

### Main admission without a merge queue

Main's merge queue stays **off**. Its required status checks use strict
up-to-date protection: if main advances before a PR merges, merge current main
into the PR branch and rerun validation. Do not bypass the rule or force-push.
This avoids a serialized admission queue, but competing promotions can still
need reruns. Check the effective branch rules through GitHub; workflow triggers
alone do not prove a queue or a required check is enabled.

`Promotion validation` is a required terminal job in `promotion-quality.yml`.
A PR from `promotion/**` or `integration/**` to main calls the existing Quality,
Unit, App, Rust, FE, browser, Docker, registry and iOS workflows with
`full-validation: true`. Discovery selects every unit/app; Docker builds and
smoke-probes every image; iOS includes simulator tests, analyzer, Release and
Maestro against real BFM/inventory processes. Every full lane must succeed;
missing, skipped, cancelled and failed lanes block promotion. Reusable validation
requires an explicit `full-validation` input; callers cannot silently omit it. Ordinary PRs
retain affected checks and receive an explicit non-promotion result.
Publishing and deployment are separate workflows.

The existing `merge_group` triggers remain available for compatibility, but
are dormant while the queue is off. Enabling a queue is a separate process
change: do not infer full promotion coverage from those triggers.

### Integration workstreams and frozen promotion

Small related PRs target `integration/<workstream>`. These protected branches
require affected deterministic checks and the review-findings gate. Expensive
iOS compilation is deferred to main admission. A green integration merge is
neither full validation nor completion of its implementation ticket. Unrelated
fixes can still target main directly.

Keep batches small and coherent. From a clean, current integration checkout:

```sh
mise exec -- node scripts/ci/integration-promote.mjs
```

The helper checks the repository/account and strict required promotion gate,
refuses a stale source or empty candidate, creates
`promotion/<workstream>/<source-sha>`, merges current main and creates a unique
snapshot commit so integration-head checks cannot be reused. It runs `mise lint`
and `mise typecheck`, pushes through normal hooks and opens the main PR. On
success it returns to integration; on failure it leaves the candidate checkout
for diagnosis. It never deletes or force-pushes a branch.

The candidate freezes **membership**, not its head: later integration commits
do not restart its checks. Fixes and current-main merges use ordinary commits
on the candidate and trigger validation again. A promotion gets its own review
of the combined diff; earlier small-PR reviews do not waive open findings.
Merge with `gh pr merge --squash` only after all required checks pass and the
branch is up to date. Confirm the PR actually reports `MERGED`.

After promotion, synchronize main back into integration through a PR using
`gh pr merge --merge` before the next snapshot, preserving ancestry after the
squash. Integration protection permits merge commits for this purpose; main
remains squash-only. Continue independent work while a candidate validates.

Measure push-to-integration, full-validation duration, base-update reruns and
push-to-main separately. Batching amortizes validation across related PRs;
it does not promise lower delivery latency for every individual change.

Two consequences worth stating, because both look like bugs from the outside:

- **A step condition spelled `github.event_name == 'push'` is a trap here.** The
  `changes` jobs in `fe-quality.yml` and `docker-build.yml` are pull-request-only,
  so on a merge group their outputs are empty; a step gated on `push` alone is
  skipped, the job still concludes `success`, and the workflow reports green
  having run nothing. Those conditions read `!= 'pull_request'` for that reason.
- **`github.base_ref` is empty on a merge group.** Anything that needs the base
  reads `github.event.merge_group.base_ref` instead, which is a full
  `refs/heads/…` ref rather than a bare branch name (`agent-review.yml`'s
  isolation litmus). Anything that needs a PR number — the advisory LLM review —
  is explicitly `github.event_name == 'pull_request'`, since
  `github.event.pull_request.draft == false` is *true* when the payload has no
  pull request at all: GitHub coerces both sides of `null == false` to `0`.

## `_discover-units.yml`

Reusable (`on: workflow_call`), called by `unit-quality.yml`, `quality.yml`,
and both `extractability-sandbox.yml` and `extractability-sandbox-push.yml`.
Its `list` job scans `pillars/` and `libs/` at maxdepth 1 and emits
`{name, pkg, dir, kind, lang}` per unit, reading `pkg` from `package.json#name`
or a `Cargo.toml` `[package].name`; manifest-less dirs are skipped and a unit
with no resolvable package name fails the job. Outputs are `units` (all) and
`changed` (units whose dir appears in the diff against the merge-base — or every
unit when `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
`tsconfig.build.json`, `.oxfmtrc.json`, `.oxlintrc.json`, `mise.toml`,
`mise.ci.toml`, `Cargo.toml` or `Cargo.lock` changed). The header explains why
the scan stops at maxdepth 1.

Calls with `full-validation: true` select every unit and client directory. For affected checks,
the diff's base differs by event: `pull_request` diffs from
`merge-base(origin/<base_ref>, HEAD)`, the PR's fork point. `push` diffs from
`github.event.before` instead — `origin/<branch>` is refreshed by the same
checkout that fetches the run's own commit, so on a push it already includes
(usually equals) HEAD, and `merge-base(HEAD, HEAD)` is `HEAD`: diffing HEAD
against itself is empty no matter what the push changed. This was verified
against a real commit pair from this repo's history before
`extractability-sandbox-push.yml` was allowed to depend on it — see the `scan`
step's own comments.

A third output, `changedClientDirs`, applies the same rule to `clients/*`
instead: outside the pnpm/cargo workspace (ADR-043), so it carries no
`package.json`/`Cargo.toml` and is never a `units`/`changed` member, but a
PR touching `clients/**` (or the same shared root above) still needs its
markdown/JSON/CSS checked by `quality.yml`'s `Format` job — the only
PR-scoped gate that applies to a client's non-Swift files, since Swift
formatting and linting is `ios-quality.yml`'s own job.

A second job, `assert-app-coverage`, enumerates the `pillars/*/app` dirs,
requires each `package.json#name` to match `@pops/app-*`, and greps both
`fe-quality.yml` and `app-quality.yml` for a `pillars/*/app/**` trigger — reading
files only, no install.

## `_extractability-sandbox-matrix.yml`

Reusable (`on: workflow_call`, one input: `units`, a JSON array of
`{name,pkg,dir,kind,lang}` objects). Sandboxes every TS unit in `units` with
`scripts/extractability/sandbox.sh` and every Rust one with
`scripts/extractability/cargo-sandbox.sh`, exactly as `extractability-sandbox.yml`
did inline before this file existed. Extracted so the nightly/on-demand sweep and the
push-triggered fan-out (below) share one sandboxing implementation instead of
two copies that could drift apart — which units to sandbox is entirely the
caller's decision; this file only knows how to sandbox whatever `units` names.

## The rest

| File                             | Trigger                                                       | Runs                                                                                                             |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `quality.yml`                    | every PR + push to `main` + every merge group — **no path filter, deliberately** | The repo-wide gate: `Lint`, `Format`, `Module boundaries`, `Duplication check` and the cross-cutting drift checks; scoped to changed units on PRs, whole tree on `main`. No job is advisory, and no job count is recorded here — it rotted twice; the file's own header is the list. See the `CI Gate` rules above |
| `unit-quality.yml`               | PR/push on unit + shared-root paths; every merge group        | separate TypeScript and Rust matrices over their changed units, without reserving opposite-language skip jobs       |
| `app-quality.yml`                | PR/push on `pillars/*/app/**`, `pillars/*/openapi/**`, FE libs; every merge group; reusable with `full-validation` | PRs run affected `@pops/app-*` packages' typecheck, generated-client drift, remote-bundle build and test; reverse transitive workspace dependencies select consumers, while dependency-graph inputs, an unusable diff base, every merge-group promotion and a reusable call with `full-validation: true` select all apps |
| `fe-quality.yml`                 | PR/push on `pillars/shell/**`, apps, openapi, FE libs; every merge group | the shell's `Quality Checks` job                                                                                     |
| `rust-quality.yml`               | PR/push on Cargo files, `deny.toml`, `pillars/contacts/**`, `libs/pops-*`, `scripts/extractability/**`; every merge group | `fmt + clippy + build + test`                                       |
| `registry-generated-quality.yml` | PR/push on `libs/module-registry/**`, `libs/types/**`; every merge group | `generated.ts` drift                                                                                                |
| `promotion-quality.yml` | every PR targeting main; full validation for `promotion/**` and `integration/**` targeting main | Calls existing validation workflows with full scope. Required `Promotion validation` rejects any full lane that is not successful; ordinary PRs retain affected checks. |
| `ios-quality.yml`                | PR on `clients/ios/**`, `pillars/bfm/**`, inventory server inputs, `scripts/ios-e2e/**`, `pnpm-lock.yaml`; reusable with `full-validation: true`; every merge group, **scoped by a `scope` job to that same filter** | `xcode-27`; selects the Xcode pinned in `clients/ios/mise.toml`, lints first, then runs host and simulator tests and a Release build that verifies no BFM host is embedded. The reusable full lane and merge-group lane add compiler-log analysis (`lint:analyze`, ~19.5 min of the job) and the Maestro UI flow against a real BFM and a real inventory pillar. A reusable promotion call does not suppress an iOS-relevant promotion's native quick PR run; both verdicts are retained. No push trigger (POPS-4152). A PR whose base is not `main` (a stacked PR) skips the macOS job. Restores host SwiftPM build products and saves them immediately after successful host tests, before simulator work; exact hits skip the save. It never caches iOS DerivedData; the header says why |
| `ios-testflight.yml`             | push to `main`; dispatch with a `sha` on `main` | an `ubuntu-latest` `pick` job (`scripts/ci/testflight-ship-sha.mjs`) chooses the newest pushed commit whose iOS Quality job ran and passed — the merge-group run, or with the queue off (POPS-4439) the `pull_request` run on the head of the PR it landed from — then `xcode-27`, environment `main` (branch-restricted to `main`); archives `Pops` and `PopsPlayground` at that commit with CalVer from `clients/ios/scripts/release-version.sh` and uploads both to TestFlight through `mise run release:testflight`. Each export still fails by default; the exact duplicate-build response is accepted only when `scripts/ci/testflight-upload.mjs` proves the same scheme, bundle id, version, build number and source commit already completed in App Store Connect. Not gated: it runs after merge |
| `agent-review.yml`               | every PR, drafts included; every merge group                  | nine guard scripts under `scripts/ci/`, each `--self-test`ed first, plus `merge-group-scope.mjs`'s preflight. Deterministic only — the advisory reviewer that used to be its last step is now `pr-review.yml` |
| `pr-review.yml`                  | every non-draft, non-Dependabot PR; **no** merge group, **not** required, **not** in `ci-gate.yml`'s gated list | the compounding LLM review: one sticky comment per PR, only the commits pushed since the last run, findings carried forward and resolved from the tree. Debounced for 15 seconds by default and `cancel-in-progress: true`, so a burst still collapses to the newest head without adding a minute to every ordinary review. Skips, by design, a PR whose every changed path is on the design playground's design surface — `scripts/ci/design-surface-only.mjs` decides, fail-closed, and `review-findings-gate.yml` asks it the same question. Job-level skipped for a Dependabot-authored PR (POPS-3343): that run cannot read `CLAUDE_CODE_OAUTH_TOKEN` regardless, and a skip is safe here specifically because this job is neither required nor gated |
| `pr-review-dependabot.yml`       | every non-draft, Dependabot-authored PR; **no** merge group, **not** required, **not** in `ci-gate.yml`'s gated list | the substitute for the row above, only for the PRs it cannot run on (POPS-3343): posts the identical sticky-comment contract with zero findings, via the same `pr-review.mjs publish` code path, but never calls a model or reads the diff — a prose line above the state marker says so |
| `review-findings-gate.yml`       | every PR, drafts included; every merge group; **required**                                    | blocks a merge while `pr-review.yml`'s (or, on a Dependabot PR, `pr-review-dependabot.yml`'s) sticky comment carries an open finding for the head commit (POPS-2661); polls for the debounced review, passes through on a merge group, and passes without polling on a design-surface-only diff because no review will ever come |
| `docker-build.yml`               | PR/push on Dockerfiles, `infra/docker*`, lockfile; every merge group, **scoped by a `scope` job to that same filter** | the FULL image of every `pillars/*/Dockerfile`, each then started on fresh volumes and probed by `scripts/ci/smoke-image.mjs`; `docker compose config --quiet` on both compose files after stubbing 12 secret files |
| `pillar-quality.yml`             | push to `main` only                                           | full image (`push: false`) per `pillars/<x>` that has a `package.json`                                               |
| `pillar-schema-coverage.yml`     | PR/push on `pillars/*/src/db/**`, migrations                  | per-pillar coverage, an injected-table self-test, and a static `Pillar schema coverage` aggregator job               |
| `publish-images.yml`             | push to `main`, `v*` tags, dispatch (`only` input)            | four static app images plus every `pops-<x>` discovered from the prod compose's `image:` refs                        |
| `release.yml`                    | push to `main`, dispatch                                      | `.github/scripts/release.sh` decides whether to cut at all, then the moltbot bundle, an annotated tag, `gh release create`, and a `workflow_dispatch` of `publish-images.yml` at that tag — the tag push itself cannot trigger it, being a `GITHUB_TOKEN` event |
| `infra-lint.yml`                 | PR/push on `infra/litestream/**`, `infra/backup/**`           | YAML lint                                                                                                           |
| `extractability-sandbox.yml`     | nightly cron + `workflow_dispatch` (optional single-`unit` input) — **not** PR/push, **not** in `ci-gate.yml`'s gated list | EX-2 via `_extractability-sandbox-matrix.yml` over every unit `_discover-units.yml` discovers (or just the dispatched one) — the true zero-workspace extraction proof, too heavy for a per-push gate |
| `extractability-sandbox-push.yml` | push to `main` on a unit's `package.json`/`tsconfig*.json`/`Cargo.toml`/`Cargo.lock`/`pnpm-lock.yaml` — **not** PR, **not** in `ci-gate.yml`'s gated list | EX-2 via `_extractability-sandbox-matrix.yml`, scoped to ONLY `_discover-units.yml`'s `changed` set for that push — fast feedback on an exports/dep-shape change instead of waiting for the nightly sweep |
| `workflows-quality.yml`          | PR/push on `.github/workflows/**`                             | YAML lint                                                                                                           |
| `fe-test-e2e.yml`                | PR on the shell/app/nav/registry/sdk/types/ui paths, push to `main`, merge group, dispatch | Playwright over the shell and the app bundles it mounts; no pillar backend runs — each spec fulfils its own `/<pillar>-api` surface |
| `live-seam.yml`                  | PR/push on `libs/sdk/**`, `pillars/registry/**`, the food/cerebrum/bfm live-seam module pairs + their `vitest.live-seam.config.ts`, `pillars/lists/**`, `pillars/finance/**`, `pillars/bfm/**`, `pillars/purchases/**`, and its own workflow file; no merge group | food's, cerebrum's and bfm's real-process `test:live-seam` suites, each in its own job. **Advisory, not gated** — neither job is in `ci-gate.yml`'s `gated` array or the ruleset, deliberately, for a bake-in period; see the file header |
| `cross-pr-line-budget.yml`       | every PR (no path filter); no push, no merge group; **not** required, **not** in `ci-gate.yml`'s gated list | `scripts/ci/check-cross-pr-line-budget.mjs` — projects this PR's diff against the heads of the other open PRs on the same base and warns when the pair would tip a file over its oxlint `max-lines` cap. **Advisory, and in its own workflow so that is true rather than claimed**: it sat in `quality.yml` calling itself advisory while `CI Gate` aggregated that workflow, so an unreadable sibling head blocked unrelated PRs (POPS-3362). Still exits non-zero when it cannot look — "could not answer" must not read like "no collision" |
| `inventory-acceptance.yml`       | `workflow_dispatch` only — **opt-in verification, not a guard** (ADR-045's 2026-09-24 amendment); not in `ci-gate.yml`, not in the ruleset | `scripts/inventory-acceptance/run.mjs` (POPS-4354) against real registry/inventory/bfm/mcp processes: vitest always, Playwright (S7) when `run_web` (default true), Maestro against a real iOS simulator (`xcode-27`) when `run_ios` (default false, tens of minutes). Writes evidence records, and packets when dispatched with `pull_request`/`pr_issue`, uploaded as artifacts |

`publish-images.yml`'s `discover` job filters on `pillars/<x>/Dockerfile`
existing. `shell`, `mcp`, `orchestrator` and `docs` all have one, so the four
images in the static `apps` matrix are also built by the `pillars` job.

Main admission gates image validation through `CI Gate` for affected ordinary
PRs and through `Promotion validation` for every promotion image. The publisher
has no dependency on those jobs: it runs after main advances. Ordinary PR image
checks remain path-scoped, so their green result is not proof that every image
was smoke-probed. Promotions provide that full sweep.

- `workflow_dispatch` publishing is independent of PR admission.
- A manually pushed tag is gated only by the commit it points to.
