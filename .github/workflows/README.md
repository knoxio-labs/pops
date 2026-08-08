# .github/workflows

19 workflows. Every job runs on `ubuntu-latest` except `ios-quality.yml`, which needs macOS to compile Swift at all.

## `ci-gate.yml` — the one static aggregate context

`ci-gate.yml` runs a job named `Publish CI Gate verdict`, triggered
`on: workflow_run` `types: [completed]` of eight workflows: Unit Quality, FE
Quality, Rust Quality, App Quality, Quality, Registry Generated Quality, iOS
Quality, Docker Build. Each name appears twice in that file — in the trigger
array and in the `gated` array inside the script — and either alone is inert. It
reads their conclusions through the Actions API and runs none of them itself. The
file header carries the argument for `workflow_run` over `needs:`, for why the
verdict converges, and for why it publishes its own check run; the rules the
`github-script` step implements:

- Concurrency is keyed `ci-gate-${{ github.event.workflow_run.head_sha }}` with
  `cancel-in-progress: true`, so every sibling completion for a commit collapses
  onto one evaluation lane.
- All runs at that head SHA are paginated; the newest run per gated workflow name
  wins, ordered by `run_number` then `run_attempt`.
- The gate fails on `failure`, `cancelled`, `timed_out`, `startup_failure`,
  `action_required` or `stale`.
- A gated workflow with no run at the SHA is logged as `did not run —
  path-filtered, treated as pass`.
- A run that is not yet `completed` is pending: it does not fail the gate, but it
  does hold it at `in_progress`. A failure concludes immediately (nothing can
  clear it); `success` is only ever published once nothing is left in flight.
- The verdict is POSTed as a **check run named `CI Gate` against
  `github.event.workflow_run.head_sha`** (hence `permissions: checks: write`).
  That is the context to put in the branch ruleset.

### Rules this file exists to stop people relearning

**A `workflow_run` job's implicit check run lands on the default branch's tip,
not on the head it judged.** Until the gate began POSTing its own check run it
had never once appeared on a pull request, however green or red it was. If the
`checks.create` call is ever dropped, the gate silently reverts to being a
post-hoc signal on `main`.

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

**A guard must behave under the condition it exists to detect.** Every rule
above shares a shape: something reported green in the state it was built to
catch. The implicit check run was green on `main` while judging nothing; a
premature `success` was green while seven workflows were still running; and the
first version of the wiring guard threw a `TypeError` instead of reporting when
the `Quality` workflow was renamed — the drift it exists to find. When you write
a check here, exercise it against the failure it targets, not only against a
healthy tree.

`scripts/ci/check-ci-gate-wiring.mjs` asserts the rules above, plus the
trigger/`gated` agreement and that every gated name still resolves to a real
workflow. It runs in `quality.yml`'s `Scripts tests` job.

### Current state of the ruleset

The `main` branch ruleset requires `agent-review`, `Lint`, `Format`,
`Module boundaries` and `Duplication check`. **`CI Gate` is not among them**, so
today it reports on the PR but does not block it — typecheck, test, build,
clippy, exports, extractability, bundle-map, drift and the Docker image smoke
are all still advisory in the ruleset's eyes. Adding `CI Gate` to the required
contexts is a repository setting, not a change to this repo, and it is safe only
while `Quality` stays gated and unfiltered (that is what guarantees the context
reports on every PR, docs-only ones included — a required context that never
reports blocks its PR forever).

## `_discover-units.yml`

Reusable (`on: workflow_call`), called by `unit-quality.yml` and `quality.yml`.
Its `list` job scans `pillars/` and `libs/` at maxdepth 1 and emits
`{name, pkg, dir, kind, lang}` per unit, reading `pkg` from `package.json#name`
or a `Cargo.toml` `[package].name`; manifest-less dirs are skipped and a unit
with no resolvable package name fails the job. Outputs are `units` (all) and
`changed` (units whose dir appears in the diff against the merge-base — or every
unit when `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
`tsconfig.build.json`, `.oxfmtrc.json`, `.oxlintrc.json`, `mise.toml`,
`mise.ci.toml`, `Cargo.toml` or `Cargo.lock` changed). The header explains why
the scan stops at maxdepth 1.

A second job, `assert-app-coverage`, enumerates the 7 `pillars/*/app` dirs,
requires each `package.json#name` to match `@pops/app-*`, and greps both
`fe-quality.yml` and `app-quality.yml` for a `pillars/*/app/**` trigger — reading
files only, no install.

## The rest

| File                             | Trigger                                                       | Runs                                                                                                             |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `quality.yml`                    | every PR + push to `main` — **no path filter, deliberately**  | 15 jobs incl. `Lint`, `Format`, `Module boundaries`, `Duplication check`; scoped to changed units on PRs, whole tree on `main`. No job is advisory — see the `CI Gate` rules above |
| `unit-quality.yml`               | PR/push on unit + shared-root paths                           | ts and rust lanes over the changed-unit matrix                                                                      |
| `app-quality.yml`                | PR/push on `pillars/*/app/**`, `pillars/*/openapi/**`, FE libs | each `@pops/app-*`'s own typecheck + test                                                                           |
| `fe-quality.yml`                 | PR/push on `pillars/shell/**`, apps, openapi, FE libs         | the shell's `Quality Checks` job                                                                                     |
| `rust-quality.yml`               | PR/push on Cargo files, `deny.toml`, `pillars/contacts/**`, `libs/pops-*`, `scripts/extractability/**` | `fmt + clippy + build + test`                                       |
| `registry-generated-quality.yml` | PR/push on `libs/module-registry/**`, `libs/types/**`         | `generated.ts` drift                                                                                                |
| `ios-quality.yml`                | PR/push on `clients/ios/**`, `pillars/bfm/openapi/**`         | `macos-latest`; selects the Xcode pinned in `clients/ios/mise.toml`, then `mise run build` / `test` / `lint`         |
| `agent-review.yml`               | non-draft PR                                                  | six guard scripts under `scripts/ci/`, each `--self-test`ed first, then an advisory LLM review                       |
| `docker-build.yml`               | PR/push on Dockerfiles, `infra/docker*`, lockfile             | builder stage of every `pillars/*/Dockerfile`; `docker compose config --quiet` on both compose files after stubbing 12 secret files |
| `pillar-quality.yml`             | push to `main` only                                           | full image (`push: false`) per `pillars/<x>` that has a `package.json`                                               |
| `pillar-schema-coverage.yml`     | PR/push on `pillars/*/src/db/**`, migrations                  | per-pillar coverage, an injected-table self-test, and a static `Pillar schema coverage` aggregator job               |
| `publish-images.yml`             | push to `main`, `v*` tags, dispatch (`only` input)            | four static app images plus every `pops-<x>` discovered from the prod compose's `image:` refs                        |
| `release.yml`                    | `workflow_dispatch`                                           | `.github/scripts/release.sh`, then annotated tag + `gh release create`                                               |
| `format-drift-watchdog.yml`      | cron `0 */6 * * *` + dispatch                                 | whole-tree `pnpm format:check` on `main`; opens, updates or closes one tracking issue                                |
| `infra-lint.yml`                 | PR/push on `infra/litestream/**`, `infra/backup/**`           | YAML lint                                                                                                           |
| `workflows-quality.yml`          | PR/push on `.github/workflows/**`                             | YAML lint                                                                                                           |
| `fe-test-e2e.yml`                | `workflow_dispatch` only                                      | Playwright, manual — see the header for why it is off PR/push                                                        |

`publish-images.yml`'s `discover` job filters on `pillars/<x>/Dockerfile`
existing. `shell`, `mcp`, `orchestrator` and `docs` all have one, so the four
images in the static `apps` matrix are also built by the `pillars` job.
