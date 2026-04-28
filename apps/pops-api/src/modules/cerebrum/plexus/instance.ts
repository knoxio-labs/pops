/**
 * Plexus process-scoped singletons.
 *
 * The lifecycle manager and registry are long-lived — one instance per process.
 * Drizzle / SQLite access is resolved per-call inside the lifecycle manager
 * itself so env-scoped DB context is honoured.
 */
import { PlexusLifecycleManager } from './lifecycle.js';
import { PlexusRegistry } from './registry.js';

let cachedLifecycle: PlexusLifecycleManager | null = null;
let cachedRegistry: PlexusRegistry | null = null;

/** Return the shared lifecycle manager singleton. */
export function getPlexusLifecycle(): PlexusLifecycleManager {
  cachedLifecycle ??= new PlexusLifecycleManager();
  return cachedLifecycle;
}

/** Return the shared registry singleton. */
export function getPlexusRegistry(): PlexusRegistry {
  if (!cachedRegistry) {
    cachedRegistry = new PlexusRegistry(getPlexusLifecycle());
  }
  return cachedRegistry;
}

/** Test hook — drop cached singletons so tests can rebind. */
export function resetPlexusCache(): void {
  cachedLifecycle = null;
  cachedRegistry = null;
}
