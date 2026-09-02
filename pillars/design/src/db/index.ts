/**
 * Internal barrel for the design pillar's persistence layer.
 *
 * PRIVATE to the pillar: `@pops/design` publishes no `exports` map at all, so
 * nothing outside can reach this. `src/api/` imports it by relative path.
 */
export * from './schema.js';
export * from './services/index.js';

export { openDesignDb, type DesignDb, type OpenedDesignDb } from './open-design-db.js';
