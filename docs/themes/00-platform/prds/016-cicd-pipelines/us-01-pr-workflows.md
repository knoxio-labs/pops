# US-01: PR quality gate workflows

> PRD: [016 — CI/CD Pipelines](README.md)
> Status: Done

## Description

As a developer, I want CI workflows that run on every PR so that broken code can't be merged.

## Acceptance Criteria

- [x] `quality.yml` runs root-level lint + format check on every PR
- [x] Per-area quality workflows (`api-quality.yml`, `fe-quality.yml`, `ai-quality.yml`, `finance-quality.yml`, `inventory-quality.yml`, `media-quality.yml`, `ui-quality.yml`, `db-types-quality.yml`, `api-client-quality.yml`, `navigation-quality.yml`) run typecheck/lint/test scoped to their package
- [x] `api-test.yml` runs the API integration test suite
- [x] `fe-test-e2e.yml` runs Playwright tests against the shell
- [x] `docker-build.yml` builds every Dockerfile and validates compose configs on PRs that touch them
- [x] `workflows-quality.yml` lints the workflow files themselves with actionlint
- [x] Path filters configured — workflows only trigger on relevant file changes
- [x] All workflows run on `ubuntu-latest` (no self-hosted runners — pops CI never depends on the home lab)
- [x] Failing workflow blocks PR merge

## Notes

Path filters prevent unnecessary CI runs. API changes don't trigger shell CI, and vice versa. Server-side / ansible CI lives in `knoxio/homelab-infra`, not here.
