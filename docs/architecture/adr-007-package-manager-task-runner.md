# ADR-007: Package Manager & Task Runner

## Status

Accepted

## Context

POPS is a monorepo with 10+ workspace packages. It needs a package manager that handles workspaces well, a build orchestrator that caches across packages, and a task runner for non-build operations (dev servers, DB management, Docker, Ansible).

## Options Considered

| Option                               | Pros                                                                                                        | Cons                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| pnpm                                 | Strict dependency resolution (no phantom deps), fast installs, content-addressable store, native workspaces | Different CLI from npm                                  |
| npm workspaces                       | Built-in, zero install                                                                                      | Slower, no strict resolution, weaker workspace support  |
| Yarn v4 (Berry)                      | Plug'n'Play, zero-installs                                                                                  | Complex config, PnP compatibility issues                |
| Turbo (build orchestration)          | Caches builds across packages, parallelises tasks, understands workspace deps                               | Another tool in the chain                               |
| mise (task runner + version manager) | Polyglot, auto Node pinning, simple config                                                                  | More complex than a plain Makefile                      |
| just (task runner)                   | Simple, transparent                                                                                         | Doesn't manage tool versions — would need a second tool |

## Decision

pnpm + mise. Two tools, each with a clear role:

- **pnpm** — Package management. Strict dependency resolution prevents phantom deps. Native workspace support via `pnpm-workspace.yaml`
- **mise** — Task runner and tool version management. Pins Node version (valuable when AI agents do development). Runs build/typecheck/test/dev as well as non-build tasks (DB management, Docker, Ansible, imports)

Turbo was chosen alongside them and later removed (#3531): `tsc -b` project references order the TypeScript build (`mise run build`), `mise run build:rust` builds the cargo workspace, and `mise run run-all <task>` fans a task out to every unit that defines it.

## Consequences

- Two tools with no overlap — pnpm installs, mise runs tasks, pins versions, and drives builds
- AI agents get auto-pinned Node version without manual setup
- Strict dependency resolution catches missing dependencies early
- Build ordering and incremental rebuilds come from `tsc -b`, not a task-level cache
- All common operations available via `mise tasks` — no need to remember per-package scripts
