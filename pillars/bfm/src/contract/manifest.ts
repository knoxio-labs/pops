/**
 * The stable `@pops/bfm/manifest` import subpath — the structural snapshot of
 * this pillar's public surface, so consumers pin one path rather than tracking
 * where the contract type happens to live.
 *
 * Deliberately exports no runtime `ModuleManifest` value, unlike the pillars
 * that carry one. That type's `surfaces` field must name at least one shell
 * surface, and `libs/module-registry`'s discovery walk turns every exported
 * `ModuleManifest` into an installed module in the shell's static registry.
 * bfm serves a native client over HTTP and mounts nothing in the shell, so a
 * manifest here would install a phantom app. Registration with the `registry`
 * pillar goes through the separate `ManifestPayload` in
 * `src/api/manifest.ts`, which is the pillar-fleet mechanism.
 */
export type { BfmContract } from './rest.js';
