# .github/workflows

19 workflows. Every job runs on `ubuntu-latest` except `ios-quality.yml`, which needs macOS to compile Swift at all.

## `ci-gate.yml` — the one static required context

`ci-gate.yml` publishes a single job named `CI Gate`, triggered
`on: workflow_run` `types: [completed]` of seven workflows: Unit Quality, FE
Quality, Rust Quality, App Quality, Quality, Registry Generated Quality, iOS
Quality. Each name appears twice in that file — in the trigger array and in the
`gated` array inside the script — and either alone is inert. It reads
their conclusions through the Actions API and runs nothing itself
(`permissions:` are `actions`/`checks`/`contents: read`). The file header carries
the argument for `workflow_run` over `needs:` and for why the verdict converges;
the rules the `github-script` step implements:

- Concurrency is keyed `ci-gate-${{ github.event.workflow_run.head_sha }}` with
  `cancel-in-progress: true`, so every sibling completion for a commit collapses
  onto one evaluation lane.
- All runs at that head SHA are paginated; the newest run per gated workflow name
  wins, ordered by `run_number` then `run_attempt`.
- The gate fails on `failure`, `cancelled`, `timed_out`, `startup_failure`,
  `action_required` or `stale`.
- A gated workflow with no run at the SHA is logged as `did not run —
  path-filtered, treated as pass`.
- A run that is not yet `completed` is reported as pending and does not fail.

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
| `quality.yml`                    | every PR + push to `main` — **no path filter, deliberately**  | 15 jobs incl. `Lint`, `Format`, `Module boundaries`, `Duplication check`; scoped to changed units on PRs, whole tree on `main` |
| `unit-quality.yml`               | PR/push on unit + shared-root paths                           | ts and rust lanes over the changed-unit matrix                                                                      |
| `app-quality.yml`                | PR/push on `pillars/*/app/**`, `pillars/*/openapi/**`, FE libs | each `@pops/app-*`'s own typecheck + test                                                                           |
| `fe-quality.yml`                 | PR/push on `pillars/shell/**`, apps, openapi, FE libs         | the shell's `Quality Checks` job                                                                                     |
| `rust-quality.yml`               | PR/push on Cargo files, `deny.toml`, `pillars/contacts/**`, `libs/pops-*`, `scripts/extractability/**` | `fmt + clippy + build + test`                                       |
| `registry-generated-quality.yml` | PR/push on `libs/module-registry/**`, `libs/types/**`         | `generated.ts` drift                                                                                                |
| `ios-quality.yml`                | PR/push on `clients/ios/**`, `pillars/bfm/openapi/**`         | `macos-latest`; selects the Xcode pinned in `clients/ios/mise.toml`, then `mise run build` / `test` / `lint`         |
| `agent-review.yml`               | non-draft PR                                                  | seven guard scripts under `scripts/ci/`, each `--self-test`ed first, then an advisory LLM review                       |
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
