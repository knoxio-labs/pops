/**
 * The design pillar's schema barrel — the surface
 * `scripts/check-pillar-schema-coverage.mjs` reads to decide which tables the
 * migrations journal must create.
 */
export { designThreads } from './schema/threads.js';
export { designMessages } from './schema/messages.js';
