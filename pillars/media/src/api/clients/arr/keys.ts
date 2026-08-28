/**
 * Settings keys backing the *arr connection and download defaults.
 *
 * These are the same keys the `arrManifest` declares, so the settings UI and
 * the client factories address one store rather than two — see `config.ts`
 * for why that split mattered.
 */
export const ARR_KEYS = {
  radarrUrl: 'radarr_url',
  radarrApiKey: 'radarr_api_key',
  sonarrUrl: 'sonarr_url',
  sonarrApiKey: 'sonarr_api_key',
  qualityProfileId: 'rotation_quality_profile_id',
  rootFolderPath: 'rotation_root_folder_path',
} as const;
