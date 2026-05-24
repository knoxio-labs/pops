# US-01: Location & item write tools

> PRD: [PRD-103 — Inventory MCP Write Tools](README.md)
> Status: Done

## Goal

Implement MCP create/update/delete tools for locations and items, alongside their existing read tools, in split domain files that stay under the 200-line oxlint limit.

## Acceptance Criteria

- [x] `apps/pops-mcp/src/tools/inventory-locations.ts` — 6 tools: `tree`, `list`, `create`, `update`, `delete` (with `requiresConfirmation` handling); each under 200 lines total
- [x] `apps/pops-mcp/src/tools/inventory-items.ts` — 6 tools: `list`, `get`, `create`, `update`, `delete`
- [x] `nullStr` / `nullNum` helpers in `utils.ts` used for nullable update fields
- [x] `inventory-locations.test.ts` — unit tests for all 6 location tools including `requiresConfirmation` flow
- [x] `inventory-items.test.ts` — unit tests for all 6 item tools
- [x] Pre-commit lint + typecheck pass
