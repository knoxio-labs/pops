/**
 * The pillar's page surface: one entry per route the app mounts, pairing the
 * route's path with the bundle slot that names the component rendering it.
 *
 * It lives in the contract because two packages need the same pairing and
 * neither can see the other's source. `src/api/manifest.ts` projects it onto
 * `ManifestPayload.pages` for the registry; `@pops/app-media` resolves the
 * slot to the component its route table already mounts.
 *
 * **Every route, not only the rail-reachable ones.** The list this replaces
 * had eight entries for twenty routes. That was harmless while the shell
 * mounted the whole `routes` array from its bundle map, and a 404 on twelve
 * URLs the moment the pillar mounted from `pages` alone (POPS-3226) — every
 * detail page, every legacy redirect, and the whole rotation surface, none of
 * which has a nav item that would look broken.
 */
export const MEDIA_PAGES = [
  { path: '', index: true, bundleSlot: 'media-library' },
  { path: 'movies/:id', bundleSlot: 'media-movie-detail' },
  { path: 'tv/:id', bundleSlot: 'media-tv-detail' },
  { path: 'tv/:id/season/:num', bundleSlot: 'media-season-detail' },
  { path: 'watchlist', bundleSlot: 'media-watchlist' },
  { path: 'history', bundleSlot: 'media-history' },
  { path: 'discover', bundleSlot: 'media-discover' },
  { path: 'rankings', bundleSlot: 'media-rankings' },
  { path: 'search', bundleSlot: 'media-search' },
  { path: 'compare', bundleSlot: 'media-compare' },
  { path: 'compare/history', bundleSlot: 'media-comparison-history' },
  { path: 'quick-pick', bundleSlot: 'media-quick-pick' },
  { path: 'rotation/log', bundleSlot: 'media-rotation-log' },
  { path: 'rotation/candidates', bundleSlot: 'media-candidate-queue' },
  { path: 'arr/calendar', bundleSlot: 'media-calendar' },
  { path: 'tier-list', bundleSlot: 'media-tier-list' },
  // Redirects into the settings page and across the pillar. They render
  // nothing but a `<Navigate>`, which is exactly why they are easy to read as
  // "not real pages" and drop — and dropping one turns an old bookmark into a
  // 404 rather than into anything that looks wrong.
  { path: 'plex', bundleSlot: 'media-plex-redirect' },
  { path: 'arr', bundleSlot: 'media-arr-redirect' },
  { path: 'rotation', bundleSlot: 'media-rotation-redirect' },
  { path: 'calendar', bundleSlot: 'media-calendar-redirect' },
] as const;

/**
 * The settings-widget slots this pillar's bundle supplies.
 *
 * Not pages — nothing routes to them. The shell resolves each through the
 * same `bundles` record when a settings group names it (POPS-3266). They are
 * declared by the settings manifests themselves, in
 * `src/contract/settings/`; this constant exists so the app's slot map can be
 * pinned against the same names.
 */
export const MEDIA_SETTINGS_WIDGET_SLOTS = ['plex-connect', 'rotation-tuning'] as const;

/** Every bundle slot the media UI must supply a component for. */
export type MediaPageSlot = (typeof MEDIA_PAGES)[number]['bundleSlot'];
export type MediaSettingsWidgetSlot = (typeof MEDIA_SETTINGS_WIDGET_SLOTS)[number];
