# US-02: Connection write tools & barrel

> PRD: [PRD-103 — Inventory MCP Write Tools](README.md)
> Status: Done

## Goal

Implement MCP connect/disconnect tools for item-item connections, and wire all domain tool arrays into the updated barrel.

## Acceptance Criteria

- [x] `apps/pops-mcp/src/tools/inventory-connections.ts` — 4 tools: `list`, `graph`, `connect`, `disconnect`
- [x] `apps/pops-mcp/src/tools/inventory.ts` — thin barrel that spreads `locationTools`, `itemTools`, `connectionTools`
- [x] `inventory-connections.test.ts` — unit tests for all 4 connection tools
- [x] `apps/pops-mcp/src/tools/index.test.ts` — tool count assertion updated to 22
- [x] `test-helpers.ts` — `mockClient` extended with all write mutation mocks for locations, items, connections
- [x] Pre-commit lint + typecheck pass; full test suite green
