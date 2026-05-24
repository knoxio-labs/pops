# US-01: Fixture CRUD tools

> PRD: [PRD-105 — Fixture MCP Tools](README.md)
> Status: Done

## Goal

Implement MCP tools for fixture list, get, create, update, and delete; wire them into the fixture tool module; full unit test coverage.

## Acceptance Criteria

- [x] Fixture tool module exports all 8 fixture tools as a typed array
- [x] `inventory.fixtures.list` — accepts `locationId?`, `type?`, `limit?`, `offset?`; calls `client.inventory.fixtures.list.query`
- [x] `inventory.fixtures.get` — accepts `id` (required); calls `client.inventory.fixtures.get.query`
- [x] `inventory.fixtures.create` — accepts `name`, `type`, `locationId?`, `notes?`; calls `client.inventory.fixtures.create.mutate`
- [x] `inventory.fixtures.update` — accepts `id`, `name?`, `type?`, `locationId?` (nullable), `notes?` (nullable); absent fields are no-ops; explicit null clears the field
- [x] `inventory.fixtures.delete` — accepts `id`; calls `client.inventory.fixtures.delete.mutate`
- [x] Unit tests for all 5 CRUD tools covering happy path and error propagation
- [x] Tool module stays under the 200-line lint limit
