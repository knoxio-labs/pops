/**
 * Maps a shell module id to the pillar id that owns its backend (ADR-026 P3).
 *
 * Modules with an in-repo 1:1 pillar resolve to their own id, so
 * `PillarGuard` routes their health off that pillar's own `/health` status
 * rather than the platform `registry` pillar's.
 */

/** The canonical platform-pillar id, shared with the `registry` pillar's `/health` response. */
export const REGISTRY_PILLAR_ID = 'registry';

/** Module ids that are also pillar ids — each has its own in-repo 1:1 backend pillar. */
const DEDICATED_PILLAR_MODULE_IDS: ReadonlySet<string> = new Set([
  'ai',
  'cerebrum',
  'finance',
  'food',
  'inventory',
  'lists',
  'media',
]);

/**
 * Returns the pillar id that owns the backend for a given module id.
 *
 * Modules with a dedicated in-repo pillar resolve to that pillar's own id;
 * all other module ids (including shell-hosted overlays like `ego`, which
 * have no dedicated backend pillar) fall back to the platform `registry`
 * pillar.
 */
export function pillarIdForModule(moduleId: string): string {
  return DEDICATED_PILLAR_MODULE_IDS.has(moduleId) ? moduleId : REGISTRY_PILLAR_ID;
}
