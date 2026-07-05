/**
 * Maps a shell module id to the pillar id that owns its backend (ADR-026 P3).
 *
 * Module ids are pillar ids: both in-repo 1:1 pillars and external pillars
 * synthesized from the registry mount their routes under `manifest.id ===
 * pillarId`, so a module resolves to its own id and `PillarGuard` routes its
 * health off that pillar's own `/health` status. Only shell-hosted overlays
 * with no dedicated backend pillar fall back to the platform `registry`.
 */

/** The canonical platform-pillar id, shared with the `registry` pillar's `/health` response. */
export const REGISTRY_PILLAR_ID = 'registry';

/**
 * Module ids that are shell-hosted overlays with no dedicated backend pillar
 * (e.g. `ego`). Their routes are guarded off the platform `registry` pillar's
 * health because they have no `/health` surface of their own.
 */
const SHELL_HOSTED_MODULE_IDS: ReadonlySet<string> = new Set(['ego']);

/**
 * Returns the pillar id that owns the backend for a given module id.
 *
 * Module ids are pillar ids for both in-repo and external (registry-synthesized)
 * pillars, so they resolve to their own id. Shell-hosted overlays with no
 * dedicated backend pillar fall back to the platform `registry` pillar.
 */
export function pillarIdForModule(moduleId: string): string {
  return SHELL_HOSTED_MODULE_IDS.has(moduleId) ? REGISTRY_PILLAR_ID : moduleId;
}
