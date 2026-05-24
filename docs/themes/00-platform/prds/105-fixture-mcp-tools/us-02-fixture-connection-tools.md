# US-02: Item-fixture connection tools

> PRD: [PRD-105 — Fixture MCP Tools](README.md)
> Status: Done

## Goal

Add connect, disconnect, and listForItem tools for item-fixture connections; wire all 8 fixture tools into the tool registry; complete unit test coverage for all fixture tools.

## Acceptance Criteria

- [x] `inventory.fixtures.connect` — accepts `itemId`, `fixtureId`; calls `client.inventory.fixtures.connect.mutate`
- [x] `inventory.fixtures.disconnect` — accepts `itemId`, `fixtureId`; calls `client.inventory.fixtures.disconnect.mutate`
- [x] `inventory.fixtures.listForItem` — accepts `itemId`, `limit?`, `offset?`; calls `client.inventory.fixtures.listForItem.query`
- [x] Tool registry includes all 8 fixture tools alongside the existing inventory, finance, media, and cerebrum tool groups
- [x] Index coverage updated to reflect the new tool count (8 fixture tools added to the registry)
- [x] Tests cover connect, disconnect, and listForItem — including CONFLICT and NOT_FOUND error propagation
- [x] Full test suite green (`pnpm test` in `apps/pops-mcp`)
