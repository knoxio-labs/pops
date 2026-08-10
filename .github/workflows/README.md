# .github/workflows

18 workflows. Every job runs on `ubuntu-latest` except `ios-quality.yml`, which needs macOS to compile Swift at all.

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
- The run's own `run-name` states the evaluated SHA, branch and triggering
  workflow, because `gh run list` / the Actions UI file every `workflow_run`
  run under the default branch's tip regardless — see the next section for why
  that makes the run list, as opposed to the check run above, an unreliable
  place to read a commit's gate state.

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
| `ios-quality.yml`                | PR/push on `clients/ios/**`, `pillars/bfm/openapi/**`         | `macos-latest`; selects the Xcode pinned in `clients/ios/mise.toml`, then `mise run lint` and `mise run -j 1 test ::: lint:analyze` — one step, because both share a single compile. Caches no derived data, deliberately; the header says why |
| `agent-review.yml`               | every PR, drafts included                                     | eight guard scripts under `scripts/ci/`, each `--self-test`ed first, then an advisory LLM review (that last step alone is skipped on drafts) |
| `docker-build.yml`               | PR/push on Dockerfiles, `infra/docker*`, lockfile             | builder stage of every `pillars/*/Dockerfile`; `docker compose config --quiet` on both compose files after stubbing 12 secret files |
| `pillar-quality.yml`             | push to `main` only                                           | full image (`push: false`) per `pillars/<x>` that has a `package.json`                                               |
| `pillar-schema-coverage.yml`     | PR/push on `pillars/*/src/db/**`, migrations                  | per-pillar coverage, an injected-table self-test, and a static `Pillar schema coverage` aggregator job               |
| `publish-images.yml`             | push to `main`, `v*` tags, dispatch (`only` input)            | four static app images plus every `pops-<x>` discovered from the prod compose's `image:` refs                        |
| `release.yml`                    | `workflow_dispatch`                                           | `.github/scripts/release.sh`, then annotated tag + `gh release create`                                               |
| `infra-lint.yml`                 | PR/push on `infra/litestream/**`, `infra/backup/**`           | YAML lint                                                                                                           |
| `workflows-quality.yml`          | PR/push on `.github/workflows/**`                             | YAML lint                                                                                                           |
| `fe-test-e2e.yml`                | `workflow_dispatch` only                                      | Playwright, manual — see the header for why it is off PR/push                                                        |

`publish-images.yml`'s `discover` job filters on `pillars/<x>/Dockerfile`
existing. `shell`, `mcp`, `orchestrator` and `docs` all have one, so the four
images in the static `apps` matrix are also built by the `pillars` job.
