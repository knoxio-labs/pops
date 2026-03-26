# PRD-016 US-02: Manual Deploy Workflow

**GH Issue:** #377
**Status:** done

## Audit Findings

`.github/workflows/deploy.yml` exists with manual-only deployment:

- **Trigger:** `workflow_dispatch` only (no automatic deployment on push)
- **Comment in file:** "SECURITY: Disabled automatic deployment on public repo with self-hosted runner. Only allow manual deployment trigger by repo owner."
- **Quality gate:** Full quality-checks job (typecheck, lint, test for both pops-api and pops-shell) runs BEFORE the deploy job
- **Deploy job:** `needs: quality-checks`, runs on `self-hosted` runner, uses `ubuntu-latest` for CI checks

The workflow enforces quality checks as a prerequisite, preventing broken deployments.
