# US-03: Context consumer API

> PRD: [058 — Contextual Intelligence](README.md)
> Status: Done

## Description

As a developer, I want a clean API for consumers (Search, AI) to read the current context so that they can use it for prioritisation and scoping.

## Acceptance Criteria

- [x] `useAppContext()` returns full `AppContext` object
- [x] `useCurrentApp()` convenience hook returns just the app string
- [x] `useCurrentEntity()` convenience hook returns the entity if on a drill-down page, null otherwise
- [x] Context is always up-to-date (reflects current navigation state)
- [x] TypeScript types exported for consumer use
- [x] Works from any component in the tree (shell, app packages, @pops/ui)

## Notes

Consumer hooks are exported from `@pops/navigation` (same package as the context provider, US-01). This means any package in the monorepo can import `useAppContext`, `useCurrentApp`, `useCurrentEntity` without depending on the shell.
