# PRD-016 US-01: PR Quality Gate Workflows

**GH Issue:** #376
**Status:** done

## Audit Findings

Multiple CI workflows in `.github/workflows/` run on PRs:

- **pops-api-ci.yml** — triggers on PRs touching `apps/pops-api/**` or `packages/db-types/**`. Runs: typecheck, lint, format check, tests.
- **shell-ci.yml** — triggers on PRs touching `apps/pops-shell/**`, `packages/app-*/**`, `packages/ui/**`, etc. Runs quality checks.
- **ansible-ci.yml** — triggers on PRs touching `infra/ansible/**`. Runs ansible-lint + yamllint.
- **tools-ci.yml** — triggers on PRs touching import tools.
- **test.yml** and **e2e.yml** — additional test pipelines.

Path-based filtering ensures only relevant workflows run on each PR. All quality gates (typecheck, lint, format, test) are enforced before merge.
