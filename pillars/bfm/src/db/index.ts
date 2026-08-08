/**
 * Internal barrel for the bfm pillar's persistence layer.
 *
 * PRIVATE to the pillar — never exported from `@pops/bfm`'s public surface.
 * The package's `exports` map resolves only `.`, `./manifest` and
 * `./openapi`, so this is unreachable from outside; `src/api/` reaches it by
 * relative path.
 */
export * from './schema.js';
export * from './services/index.js';

export { openBfmDb, type BfmDb, type OpenedBfmDb } from './open-bfm-db.js';
export { findDeviceById, touchDevice } from './queries/devices.js';
