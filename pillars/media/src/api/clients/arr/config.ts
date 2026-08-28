/**
 * Configuration for the Radarr/Sonarr (*arr) clients.
 *
 * Stored settings first, env as the base default. Env supplies the value a
 * fresh deployment boots with; the operator overrides it from the settings UI
 * without redeploying, and the override wins from then on. This mirrors how
 * Plex already resolves its own connection (`clients/plex/service.ts`).
 *
 * It used to be env-only, on the reasoning that a server cannot write its own
 * env so env must be the single source of truth. That held for writes and not
 * for reads: the federated `/settings/*` surface was already persisting
 * `radarr_*` / `sonarr_*` to the `settings` table, so the UI wrote keys this
 * module never read. Editing the Radarr URL appeared to save and changed
 * nothing.
 *
 * The `downloadAndProtect` / rotation-addition defaults resolve the same way,
 * from `rotation_quality_profile_id` / `rotation_root_folder_path` over
 * `RADARR_QUALITY_PROFILE_ID` / `RADARR_ROOT_FOLDER_PATH`.
 */
import { type MediaDb, settingsService } from '../../../db/index.js';
import { getEnv } from '../env.js';
import { ARR_KEYS } from './keys.js';
import { RadarrClient } from './radarr-client.js';
import { SonarrClient } from './sonarr-client.js';

import type { ArrConfig } from './types.js';

export interface ArrSettings {
  radarrUrl: string | null;
  radarrApiKey: string | null;
  sonarrUrl: string | null;
  sonarrApiKey: string | null;
}

/**
 * Resolve one arr setting: stored override, then env, else `null`.
 *
 * A stored empty string is treated as unset rather than as an override of the
 * env value — resetting a field in the UI clears it to `''`, and reading that
 * as "deliberately blank" would strand the connection with no way back to the
 * deployment default short of editing the database.
 */
function resolve(db: MediaDb, key: string, envVar: string): string | null {
  const stored = settingsService.getOrNull(db, key)?.value;
  if (stored !== undefined && stored !== '') return stored;
  return getEnv(envVar) ?? null;
}

/** Read the effective arr settings: stored overrides layered over env. */
export function getArrSettings(db: MediaDb): ArrSettings {
  return {
    radarrUrl: resolve(db, ARR_KEYS.radarrUrl, 'RADARR_URL'),
    radarrApiKey: resolve(db, ARR_KEYS.radarrApiKey, 'RADARR_API_KEY'),
    sonarrUrl: resolve(db, ARR_KEYS.sonarrUrl, 'SONARR_URL'),
    sonarrApiKey: resolve(db, ARR_KEYS.sonarrApiKey, 'SONARR_API_KEY'),
  };
}

/** Create a Radarr client if configured, else `null`. */
export function getRadarrClient(db: MediaDb): RadarrClient | null {
  const s = getArrSettings(db);
  if (!s.radarrUrl || !s.radarrApiKey) return null;
  return new RadarrClient(s.radarrUrl, s.radarrApiKey);
}

/** Create a Sonarr client if configured, else `null`. */
export function getSonarrClient(db: MediaDb): SonarrClient | null {
  const s = getArrSettings(db);
  if (!s.sonarrUrl || !s.sonarrApiKey) return null;
  return new SonarrClient(s.sonarrUrl, s.sonarrApiKey);
}

/** Read-only configuration state: which connections are usable. */
export function getArrConfig(db: MediaDb): ArrConfig {
  const s = getArrSettings(db);
  return {
    radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
    sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
  };
}

/** Radarr defaults applied when rotation (or `downloadAndProtect`) adds a movie. */
export interface RotationDefaults {
  qualityProfileId: number;
  rootFolderPath: string;
}

/**
 * The Radarr root folder rotation writes to; `null` when unset. Also the path
 * the cycle matches against Radarr's disk list to find the library volume.
 */
export function getRadarrRootFolderPath(db: MediaDb): string | null {
  return resolve(db, ARR_KEYS.rootFolderPath, 'RADARR_ROOT_FOLDER_PATH');
}

/**
 * Resolve the rotation download defaults; `null` when either is unset or the
 * profile id is not a number. Stored overrides win over env, as above.
 */
export function getRotationDefaults(db: MediaDb): RotationDefaults | null {
  const rawProfileId = resolve(db, ARR_KEYS.qualityProfileId, 'RADARR_QUALITY_PROFILE_ID');
  const rootFolderPath = getRadarrRootFolderPath(db);
  if (!rawProfileId || !rootFolderPath) return null;
  const qualityProfileId = Number(rawProfileId);
  if (!Number.isFinite(qualityProfileId)) return null;
  return { qualityProfileId, rootFolderPath };
}
