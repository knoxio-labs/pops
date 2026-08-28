/**
 * The browser path that reaches a pillar's HTTP surface.
 *
 * Pillar containers know each other by docker hostname (`http://media-api:3003`),
 * which a browser cannot resolve. Every pillar is instead reached from the page
 * through the shell's own origin at `/<id>-api`, mapped onto the container by
 * the vite proxy in dev and by the generated nginx config in production.
 *
 * The platform `registry` pillar (formerly `core`) is reached at
 * `/registry-api`; the legacy `core` id maps there too, for any un-rebuilt
 * caller that has not yet observed the renamed snapshot.
 */
const REGISTRY_BASE = '/registry-api';

/** The browser-reachable API base path for `pillarId`. */
export function pillarApiBase(pillarId: string): string {
  return pillarId === 'registry' || pillarId === 'core' ? REGISTRY_BASE : `/${pillarId}-api`;
}
