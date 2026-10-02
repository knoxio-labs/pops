/**
 * Cerebrum-scoped settings manifests. Re-exports the cerebrum manifest so
 * consumers (e.g. `@pops/pillar-sdk/settings`) can pull from the pillar
 * contract package rather than `@pops/module-registry/settings`.
 */
export { cerebrumManifest } from './cerebrum/index.js';
