# ADR-049: Manifest wire shapes are declared once, in Zod, and inferred into TypeScript

## Status

Accepted — 2026-08-28. Reverses the convention the settings wire schema carried in its own docstring — "the TypeScript shape in `@pops/types` remains the source of truth; this Zod schema is the wire validator" — which was never recorded in an ADR. [ADR-037](adr-037-settings-as-manifest-dimension.md) established settings as a manifest dimension and is unaffected: it says nothing about which side declares the shape.

## Context

Every pillar's manifest travels the registry as JSON and is validated by `validateManifestPayload` inside `bootstrapPillar` before the pillar registers. Until this ADR, each shape on that wire existed twice:

- a TypeScript `interface` in `@pops/types` — the shape pillars write their manifests against;
- a `.strict()` Zod object in `@pops/pillar-sdk/src/manifest-schema/` — the shape the registry accepts.

The two were kept in step by convention, and the SDK file said so in its own docstring. Three shapes were duplicated this way: `SettingsManifest` (with `SettingsGroup`, `SettingsField`, `SettingsWidget`), `ModuleCaptureOverlayConfig`, and `FeatureDefinition`.

The failure mode is not gradual. Adding a field to the TypeScript side compiles everywhere, passes every test, and then fails on the first boot that emits it — as `unknown field`, inside `bootstrapPillar`, before the server is registered. The pillar does not degrade; it exits, and the container restart-loops.

That is not hypothetical. POPS-2581, fixed in [PR #4270](https://github.com/knoxio/pops/pull/4270): POPS-67 added `SettingsGroup.widget` to `@pops/types` for the Plex PIN flow and had `plexManifest` emit `widget: { bundleSlot: 'plex-connect' }`. The Zod mirror never gained the key. `pops-media-api` crash-looped in production for 11 restarts. The point fix added the missing key and a media-only payload test; every other pillar still had no equivalent guard.

## Options considered

| Option                                                                            | Pros                                                                                                                             | Cons                                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guard only** — keep both declarations, add a per-pillar payload test            | Smallest change; the tests are worth having regardless                                                                           | Detects drift one commit later at best. Media already had a manifest suite the day POPS-2581 shipped; a payload test only catches a field a pillar already emits |
| **Pin the mirror at compile time** — type-level parity assertions between the two | Keeps `@pops/types` dependency-free; a drifting field becomes a typecheck failure                                                | Two declarations plus a third artefact asserting they agree. The deliberate projections need declared exceptions, and an exception list is a place to hide drift |
| **Declare once in Zod, infer the types** (chosen)                                 | The field cannot exist on one side, because there is no other side. No exception list, no parity artefact, no convention to keep | `@pops/types` takes a runtime dependency on `zod` and stops being a pure type vocabulary                                                                         |

## Decision

**`@pops/types` owns the Zod schema for every shape that travels on the manifest wire, and its TypeScript types are `z.infer` of those schemas.** `@pops/pillar-sdk/manifest-schema` composes those schemas into `ManifestPayloadSchema`; it declares no shape `@pops/types` already declares.

- `settings-manifest.ts` exports `SettingsManifestSchema` / `SettingsGroupSchema` / `SettingsFieldSchema` / `SettingsWidgetSchema` / `SettingsFieldTypeSchema`, and each type is inferred from its schema.
- `module-manifest.ts` exports `ModuleCaptureOverlayConfigSchema`, with `ModuleCaptureOverlayConfig` inferred from it.
- `feature-manifest.ts` exports `FeatureDescriptorSchema` — the serializable declaration a manifest carries. `FeatureDefinition`, what the in-process feature service holds, is derived from it: `Omit<FeatureDescriptor, 'capability'> & { capabilityCheck?: () => boolean }`. The wire descriptor names a pillar and a capability key; the in-process definition holds the live `() => boolean` probe that reference stands in for. That swap is the only difference between them, and it is now written once instead of maintained across two packages.
- `manifest-primitives.ts` holds the scalar schemas the shapes are built from (pillar id, camelCase and kebab-case identifiers, procedure path, settings key, i18n key, app path). The SDK imports them rather than restating the patterns. A regex duplicated across a package boundary is the same hazard as a field duplicated across one, at a smaller scale.

The shapes the SDK still declares alone — the payload envelope, contract triplet, routes, search adapters, AI tools, sinks, nav and page descriptors — have no `@pops/types` counterpart and are not affected.

### What this costs

`@pops/types` gains `zod` as a runtime dependency and is no longer the "dependency-free type vocabulary" its own package description claimed. Its description is updated to say what it is now.

The practical cost is close to zero: every pillar and the shell already depend on `zod` directly, so nothing new enters any install closure or any bundle. The cost that is real is conceptual — a package that used to erase completely at runtime now emits schema objects, and a consumer importing a settings type now pulls a small amount of runtime code with it.

That was accepted rather than avoided. The alternative that preserves the old property — a third package owning the schemas, with `@pops/types` re-exporting the inferred types type-only — buys back a charter with a new workspace package, its own build wiring, and a `COPY` line in every pillar Dockerfile. Paying that to protect a property whose only benefit was already unrealised (zod ships in every one of these images today) is the wrong trade.

### What still stands

`FeatureStatus` / `FeatureCredentialStatus` in `pillars/registry/src/api/modules/features/types.ts` remain TypeScript-first, with Zod restatements pinned by `satisfies z.ZodType<…>`. Those are the feature service's **output** shapes, not manifest input, and they are pinned in the direction that matters for outputs. They are out of this ADR's scope; if that seam ever produces its own POPS-2581, this decision is the precedent for closing it the same way.

## Consequences

- Adding a field to a manifest shape is one edit, in one file, and it reaches both the TypeScript pillars write against and the validator the registry runs. The POPS-2581 class is closed by construction rather than detected by a guard.
- `libs/sdk/src/__tests__/single-declaration.test.ts` pins the seam by **identity** — `SettingsManifestDescriptorSchema` must _be_ `@pops/types`' `SettingsManifestSchema`, reached through `ManifestPayloadSchema.shape`. A shape comparison was deliberately not used: it would be a third statement of the same information, and it would pass the day somebody reintroduced a mirror that happened to agree, which is exactly the state that shipped POPS-2581.
- `@pops/types` is now a place where wire validation lives, not only type declarations. A pattern change there (tightening the procedure-path regex, say) changes what the registry accepts. That is the point — but it means the package is no longer safe to treat as inert.
- The per-pillar payload tests and `scripts/ci/check-manifest-payload-coverage.mjs` ([ADR-045](adr-045-guards-must-prove-they-report.md) Tier A) stay. They catch a different class this decision does not touch: a manifest that is structurally valid but violates a cross-field rule or a pattern refinement — a `procedurePath` naming a procedure the pillar does not serve, a contract tag that disagrees with the version. Those still only fail at boot unless a test emits the real payload.
