# US-04: Settings page consumes the registry

> PRD: [Plugin Contract](README.md)
> Status: Done

## Description

As a user, I want the `/settings` page to show exactly the sections the installed modules declare so that absent modules' settings don't appear and added modules don't need to register themselves separately.

## Acceptance Criteria

- [x] `/settings` route reads its sections from `MODULES.flatMap(m => m.settings ?? [])`. The shell continues to query the manifest list via the existing `core.settings.getManifests` tRPC procedure; the procedure now reads from the live module-manifest aggregator (`apps/pops-api/src/modules/manifests.ts`) — the equivalent of `MODULES` on the backend — rather than a runtime registry. A follow-up issue tracks moving the manifest list onto `@pops/module-registry`'s `MODULES` constant once that registry exposes the full `settings` slot.
- [x] `settingsRegistry.register()` is removed. Module-side `settingsRegistry.register(...)` calls are deleted; each module declares its `SettingsManifest` array in its `manifest.ts` `settings` slot.
- [x] Settings page section ordering is determined by manifest declaration order in the install set; intra-module section ordering preserved from each `SettingsManifest`'s `order` field.
- [x] PRD-093 acceptance criteria for settings page rendering remain satisfied (sections render, navigate, save).
- [x] No file outside `apps/pops-shell/src/app/settings/` and `apps/pops-api/src/modules/` references the deleted `settingsRegistry` module after this US lands.

## Notes

- `ModuleManifest.settings` widened from `SettingsManifest?` to `readonly SettingsManifest[]?` because several modules (media, core) own multiple navigable sections; the PRD's `flatMap(m => m.settings)` consumer surface assumes an iterable.
- Migration is mechanical: replace each `settingsRegistry.register(<x>)` call with `<x>` declared in the manifest's `settings` slot.
- PRD-093 is updated to point at the manifest slot as the single source of truth.
