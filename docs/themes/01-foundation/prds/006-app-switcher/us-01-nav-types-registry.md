# US-01: Define nav types and app registry

> PRD: [006 — App Switcher](README.md)
> Status: Done

## Description

As a developer, I want typed nav config interfaces and a central app registry so that apps can declare their navigation and the shell renders it dynamically.

## Acceptance Criteria

- [x] `AppNavConfig` and `AppNavItem` TypeScript interfaces defined (in shell or shared package)
- [x] App registry array in the shell holds all registered app configs
- [x] Registry is the single source of truth — sidebar/rail reads from it, no hardcoded nav lists
- [x] At least one app (finance) registered with Lucide icon references (not emoji)
- [x] Adding a new app to the registry is a one-line import + array push
- [x] Icon name strings in navConfig resolve to actual icon components — missing mappings fail visibly at dev time (TypeScript error or runtime warning), not silently at render time

## Notes

The `color` field on `AppNavConfig` is optional — it's consumed by the theme colour propagation system (PRD-007). The registry doesn't need to handle it yet, just include it in the type.

The typed catalogue is the `IconName` union in `@pops/navigation` plus `AppNavConfig` / `AppNavItem` in the shell. Build-time validation is enforced two ways: each app's `navConfig` declaration uses `satisfies AppNavConfigShape` (with `icon: IconName`), and the shell's `iconMap` uses `satisfies Record<IconName, LucideIcon>` so every member of the union must have a component. A registry-validation test (`apps/pops-shell/src/app/nav/registry.test.ts`) additionally asserts every registered nav icon resolves through `iconMap` and that app ids / basePaths / item paths are unique — drift fails CI.
