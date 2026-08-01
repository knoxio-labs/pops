# POPS – Copilot Instructions

## What This Repository Is

POPS (Personal Operations System) is a self-hosted personal command center for finance, media, inventory, and AI operations. It is a pnpm workspace running on Node.js (24 locally via `mise`, 22 in CI/production) built as a set of independent REST **pillars** — each a standalone service that owns its own SQLite database (Drizzle ORM), serves a zod → [ts-rest](https://ts-rest.com) contract projected to OpenAPI, exports a `./manifest`, and self-registers with the `registry` pillar on boot. There is **no tRPC** and **no `pops-api` monolith** — both were removed. The frontend is one React SPA (`pops-shell`) that lazy-loads per-domain feature apps over generated Hey API REST clients; cross-pillar calls go through the `@pops/pillar-sdk` `pillar()` client. AI categorization and entity matching use the Claude API; embeddings use an OpenAI-compatible client (configurable via `EMBEDDING_API_URL`, defaulting to `https://api.openai.com/v1`). Jobs run on BullMQ + Redis. The system deploys via Docker Compose to a home server behind Cloudflare Tunnel (host provisioning lives in the private `knoxio/homelab-infra` repo).

**Repo layout:**
- `pillars/<id>/` — one REST pillar per folder. Each owns its SQLite DB (`src/db`), a zod → ts-rest contract (`src/contract`), an OpenAPI snapshot (`openapi/<id>.openapi.json`), a `./manifest`, and a Dockerfile. Which pillars exist is on disk; `AGENTS.md` carries the ports table. Do not expect every pillar to fit the shape — some own no DB, one is Rust, and two serve no contract.
- `libs/<name>/` — shared workspace libraries. Each has a README stating what it is and who depends on it. A lib must never import from a pillar.
- `infra/` — Docker Compose (`docker-compose.yml` prod, `docker-compose.dev.yml` dev) + Litestream stream configs
- `docs/` — cross-cutting ADRs (`docs/architecture/`) and `vision.md`. Nothing else.

**Documentation model — three artifacts, three questions.** **WHICH**: an ADR (`docs/architecture/adr-NNN-slug.md`, or `pillars/<id>/docs/architecture/` when pillar-only; numbering is frozen and append-only). **HOW**: a `README.md` colocated in the directory it describes. **WHY**: an inline comment on the line whose reason is invisible from the code.

There are **no PRDs, themes, epics, user stories, acceptance-criteria checkboxes, status tables or roadmaps** in this repo. Do not ask for them, and treat a PR that adds one as introducing drift. The code and its tests are the specification; work that is not done lives in Huly (project `POPS`, `projects.knoxiolabs.com`).

READMEs have **no coverage quota** — one is warranted only where the code cannot speak for itself, and a directory without one is a fine outcome. Do not request a README for a directory whose file headers already explain it, and do not accept a README that merely paraphrases the code beneath it.

---

## Build, Test, and Validate

Prefer `mise` for cross-package tasks. Some checks have no `mise` wrapper and must be run directly with `pnpm`. All of the following must pass before a PR can merge:

```bash
# Via mise (run from repo root)
mise lint          # oxlint (type-aware) — zero tolerance for warnings
mise typecheck     # Full TypeScript strict check across all packages
mise test          # Vitest unit tests
mise build         # Build all packages — must produce zero errors

# Via pnpm (no mise wrapper — run from repo root or package dir)
pnpm format:check                                    # oxfmt formatting check
cd pillars/<id> && pnpm test                         # A pillar's unit tests (real in-memory SQLite)
cd pillars/shell && pnpm test:e2e                    # Playwright E2E (also run in CI)
```

Git hooks (enforced via Husky): pre-commit runs `lint-staged` (oxlint + oxfmt on staged files) and `pnpm typecheck`; pre-push checks for merge conflicts with `origin/main`. Recommended to also run `mise lint && mise typecheck && mise test` manually before pushing.

GitHub Actions runs: lint, typecheck, format, unit tests, E2E, and Docker build — all must be green.

---

## Code Review Standards

### The Reviewing Mindset

Every issue in a review is a **blocker**. There are no "non-blocking", "nit:", "optional:", or "minor:" issues. If something is wrong, insufficient, inconsistent, or incomplete, it must be fixed before the PR merges. There is no LGTM with caveats.

Do not soften or hedge. Do not say "you might want to consider" or "this is just a suggestion". State what is required and why.

### What to Check — Always

**1. Documentation sync (zero drift tolerated)**

- If a directory has a `README.md` and this PR changes behaviour that README describes, the README must change in the **same** commit — or the stale paragraph must be deleted. A README that has drifted from its code is worse than none.
- Do **not** demand a new README for changed code that has none. Ask for one only when the change introduces behaviour a reader could not recover from the code — a cross-file ordering, a precedence rule, a non-obvious invariant.
- API changes must update or maintain the pillar's OpenAPI snapshot (`pillars/<id>/openapi/<id>.openapi.json`). Regenerate via `mise openapi:generate`.
- Schema changes must have a Drizzle migration: edit the pillar's schema, run `drizzle-kit generate` in that pillar, review, and commit the result (each pillar auto-migrates its own SQLite DB on startup; there is no shared/global drizzle step).
- Any behavior documented in `AGENTS.md` that changes must be updated there too.

**2. Implementation gaps — no partial work**

- If a PR implements part of a feature but leaves gaps (TODOs, stubs, placeholder logic, skipped edge cases), either: (a) the gaps must be closed in this PR, or (b) a Huly issue must exist that explicitly tracks each gap before the PR merges. A gap without a tracking issue is a blocker.
- `// TODO`, `// FIXME`, `// HACK`, `// TEMP`, `// placeholder`, or any similar marker introduced by this PR is a blocker unless it references an open Huly issue by key (e.g. `POPS-42`). **GitHub Issues are disabled on this repo** — a bare `#NNNN` in new code is not a tracking reference.
- Commented-out code is a blocker.

**3. Correctness**

- Verify the change does what its tests claim, and that the tests would fail if it did not.
- Drizzle queries must use parameterized inputs — never string interpolation.
- All external inputs (user input, webhook payloads, imported CSV data) must be validated with Zod at the boundary.
- No secrets, `.env` values, or credentials may be hardcoded or committed.
- PII (names, emails, account numbers) must be stripped before logging.

**4. Type safety**

- TypeScript `strict` mode is always on. No `any`, no `as unknown as X`, no `@ts-ignore` without a comment explaining an upstream library bug.
- Every ts-rest route input must have a Zod schema. Every response must be typed.
- No implicit `any` from missing type annotations on function parameters.

**5. Conventions (from `AGENTS.md` → "Coding Conventions")**

- Frontend: one route = one page. Page components use shell + sections + hooks pattern for complex UIs.
- Styling: Tailwind only. No arbitrary values without a design token reason. Use `app-accent` for domain color. No `style={{}}` except for dynamic runtime values (e.g., progress bar widths computed at runtime); `w-[var(--radix-*)]` bindings are also permitted.
- Components: all new UI components must have a Storybook story.
- Icons: Lucide only. No other icon libraries.
- Database: integer PKs for domain tables, UUID text for cross-domain FKs. Timestamps as ISO 8601 `TEXT`. All schema changes via Drizzle migrations.
- Tests: next to the code they cover (`pillars/<id>/src/**/__tests__/`, `libs/<lib>/src/**`); a pillar runs its own migrations against a real in-memory/temp SQLite DB in its own tests. No shared monolith test path.

**6. Security**

- Never read, log, or pass `.env` values to untrusted surfaces.
- No raw SQL string concatenation. Drizzle ORM for all database access.
- Webhook handlers must verify signatures before processing.
- Cloudflare Access headers must not be trusted from internal traffic.

**7. Size and scope**

- A PR must do one thing. Mixed concerns (feature + refactor + docs) must be separated unless inseparable.
- Dead code introduced by a refactor must be deleted, not commented out.
- If a file grows beyond ~300 lines due to this PR, flag it as a concern and require a plan to split it.

### How to Report Issues

Report every issue as a required change. Use direct language:

> "This procedure lacks a Zod input schema. Add one before merging."
> "This changes the classification ladder, but `pillars/finance/src/api/modules/imports/README.md` still documents the old order. Update it in this PR."
> "There is no migration for the new `tags` column. Run `drizzle-kit generate` in this pillar and commit the result."
> "This TODO at line 47 has no tracking issue. Either resolve it or open a GitHub issue and reference it here."

Do not batch small issues into a single comment. File a separate review comment per issue so each can be resolved independently and tracked.

---

## Key Files for Context

| Purpose | Path |
|---|---|
| Agent guidance (primary) | `AGENTS.md` |
| Coding conventions | `AGENTS.md` → "Coding Conventions" |
| Design context | `AGENTS.md` → "Design Context" |
| Documentation model | `AGENTS.md` → "Documentation Model" |
| Work tracking | Huly, project `POPS` (`projects.knoxiolabs.com`) |
| Architecture decisions | `docs/architecture/adr-NNN-slug.md` |
| Per-pillar DB schema | `pillars/<id>/src/db/schema/` |
| Pillar ts-rest contract | `pillars/<id>/src/contract/` |
| Business logic | `pillars/<id>/src/db/services/` |
| UI components | `libs/ui/src/components/` |
| Task runner | `mise.toml` |
| CI workflows | `.github/workflows/` |

Trust these instructions. Only search the codebase when information here is incomplete or appears incorrect.
