# PRD-103: Inventory MCP Write Tools

> Theme: [00 — Platform](../../README.md)
> Epic: [03 — MCP Interface](../../epics/03-mcp-interface.md)
> Status: Done

## Overview

Extends the pops-mcp server with write (create/update/delete) tools for the inventory domain — locations, items, and item-item connections. All tools are pure MCP adapters: they forward input directly to existing pops-api tRPC mutations, with no business logic in the MCP layer.

## Motivation

MCP was initially read-only. To support AI-assisted home inventory setup (walking through a house and describing items, locations, and connections), write access is required. The entire set can be added without touching pops-api because the tRPC mutations already exist.

## Tool Surface (8 tools)

| Tool name                          | tRPC call                          | Description                     |
| ---------------------------------- | ---------------------------------- | ------------------------------- |
| `inventory.locations.create`       | `inventory.locations.create`       | Create a location node          |
| `inventory.locations.update`       | `inventory.locations.update`       | Update name / parentId / notes  |
| `inventory.locations.delete`       | `inventory.locations.delete`       | Delete location (stats / force) |
| `inventory.items.create`           | `inventory.items.create`           | Create an inventory item        |
| `inventory.items.update`           | `inventory.items.update`           | Update item fields (partial)    |
| `inventory.items.delete`           | `inventory.items.delete`           | Delete an item                  |
| `inventory.connections.connect`    | `inventory.connections.connect`    | Create item-item connection     |
| `inventory.connections.disconnect` | `inventory.connections.disconnect` | Remove item-item connection     |

## Architecture

Tools live in domain files under `apps/pops-mcp/src/tools/`:

- `inventory-locations.ts` — location read + write tools (6 total)
- `inventory-items.ts` — item read + write tools (6 total)
- `inventory-connections.ts` — connection read + write tools (4 total)
- `inventory.ts` — thin barrel, spreads all three arrays

The 200-line oxlint limit per file required splitting the originally monolithic `inventory.ts` into domain files.

## Business Rules

- All tools call `protectedProcedure` endpoints; the MCP service-account key provides auth.
- `locations.delete` returns `{ requiresConfirmation: true, stats }` (not an error) when location has children/items and `force` is not set. The tool returns this as a successful JSON response.
- `items.update` and `locations.update` use nullable field semantics: passing `null` clears the field; omitting the key is a no-op. The `nullStr`/`nullNum` helpers in `utils.ts` handle this distinction.
- Error propagation: tRPC errors (NOT_FOUND, CONFLICT, etc.) propagate naturally through the MCP SDK's tool handler error path.

## User Stories

| US    | Title                           | Status |
| ----- | ------------------------------- | ------ |
| US-01 | Location & item write tools     | Done   |
| US-02 | Connection write tools & barrel | Done   |
