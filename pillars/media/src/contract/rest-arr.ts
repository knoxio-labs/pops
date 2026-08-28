/**
 * `arr.*` sub-router — Radarr + Sonarr download-manager integration.
 *
 * Connection config and the download-and-protect defaults are OWNED BY THE
 * FEDERATED `/settings/*` SURFACE, not by this sub-router: the settings UI
 * writes `radarr_*` / `sonarr_*` / `rotation_quality_profile_id` /
 * `rotation_root_folder_path` there, and `clients/arr/config.ts` resolves
 * those over the matching env vars as boot defaults. That is why the `config`
 * and `settings` routes here are read-only projections rather than a
 * save-settings route.
 *
 * The route maps are split across `rest-arr-radarr.ts` / `rest-arr-sonarr.ts`
 * (per-file line cap); this file flattens them into one sub-router so the
 * operation ids stay `arr.<route>`.
 */
import { initContract } from '@ts-rest/core';

import { radarrRoutes } from './rest-arr-radarr.js';
import { sonarrRoutes } from './rest-arr-sonarr.js';

const c = initContract();

export const mediaArrContract = c.router({
  ...radarrRoutes,
  ...sonarrRoutes,
});
