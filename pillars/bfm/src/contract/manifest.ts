/**
 * The stable `@pops/bfm/manifest` import subpath — the structural snapshot of
 * this pillar's public surface, so consumers pin one path rather than tracking
 * where the contract type happens to live.
 *
 * It also exports the runtime `bfmManifest`. `libs/module-registry`'s
 * discovery walk turns every exported `ModuleManifest` into an installed
 * module in the shell's static registry, so this value is what makes `bfm` a
 * gateable id in `POPS_APPS` and what lets the shell mount `@pops/app-bfm` on
 * its offline floor. It exists only now that there IS a shell surface to
 * install — before `pillars/bfm/app` it would have installed a phantom app.
 *
 * Registration with the `registry` pillar is a separate mechanism and goes
 * through the `ManifestPayload` in `src/api/manifest.ts`.
 */
import type { ModuleManifest } from '@pops/types';

export type { BfmContract } from './rest.js';

export const bfmManifest: ModuleManifest = {
  id: 'bfm',
  name: 'Devices',
  version: '0.1.0',
  surfaces: ['app'],
  description: 'Pair, list and revoke the native mobile clients the bfm pillar serves.',
};
