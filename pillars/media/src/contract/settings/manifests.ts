import type { SettingsManifest } from '@pops/types';

export const arrManifest: SettingsManifest = {
  id: 'media.arr',
  title: 'Arr',
  icon: 'Download',
  order: 110,
  groups: [
    {
      id: 'radarr',
      title: 'Radarr',
      description: 'Movie download management.',
      fields: [
        { key: 'radarr_url', label: 'Radarr URL', type: 'url', envFallback: 'RADARR_URL' },
        {
          key: 'radarr_api_key',
          label: 'Radarr API Key',
          type: 'password',
          sensitive: true,
          envFallback: 'RADARR_API_KEY',
          testAction: { procedure: 'media.arr.testRadarrSaved', label: 'Test Radarr' },
        },
      ],
    },
    {
      id: 'sonarr',
      title: 'Sonarr',
      description: 'TV show download management.',
      fields: [
        { key: 'sonarr_url', label: 'Sonarr URL', type: 'url', envFallback: 'SONARR_URL' },
        {
          key: 'sonarr_api_key',
          label: 'Sonarr API Key',
          type: 'password',
          sensitive: true,
          envFallback: 'SONARR_API_KEY',
          testAction: { procedure: 'media.arr.testSonarrSaved', label: 'Test Sonarr' },
        },
      ],
    },
    {
      id: 'download_defaults',
      title: 'Download Defaults',
      description:
        'Quality profile and root folder used when downloading movies via the Download button. The root folder also tells the rotation cycle which Radarr volume to measure — without it the cycle skips.',
      fields: [
        {
          key: 'rotation_quality_profile_id',
          label: 'Quality Profile',
          type: 'select',
          envFallback: 'RADARR_QUALITY_PROFILE_ID',
          optionsLoader: {
            procedure: 'media.arr.getQualityProfiles',
            valueKey: 'id',
            labelKey: 'name',
          },
        },
        {
          key: 'rotation_root_folder_path',
          label: 'Root Folder',
          type: 'select',
          envFallback: 'RADARR_ROOT_FOLDER_PATH',
          optionsLoader: {
            procedure: 'media.arr.getRootFolders',
            valueKey: 'path',
            labelKey: 'path',
          },
        },
      ],
    },
  ],
};

export const rotationManifest: SettingsManifest = {
  id: 'media.rotation',
  title: 'Rotation',
  icon: 'Shuffle',
  order: 120,
  groups: [
    {
      id: 'schedule',
      title: 'Schedule',
      fields: [
        { key: 'rotation_enabled', label: 'Enable Rotation', type: 'toggle' },
        {
          key: 'rotation_cron_expression',
          label: 'Cron Schedule',
          type: 'text',
          default: '0 3 * * *',
          description: 'Cron expression for when rotation runs (e.g. "0 3 * * *" = daily at 3 AM).',
        },
      ],
    },
    {
      id: 'capacity',
      title: 'Capacity',
      fields: [
        {
          key: 'rotation_target_free_gb',
          label: 'Target Free Space (GB)',
          type: 'number',
          default: '100',
          validation: { min: 0 },
        },
        {
          key: 'rotation_avg_movie_gb',
          label: 'Average Movie Size (GB)',
          type: 'number',
          default: '15',
          validation: { min: 1 },
        },
      ],
    },
    {
      id: 'protection',
      title: 'Protection',
      fields: [
        {
          key: 'rotation_protected_days',
          label: 'Protected Days',
          type: 'number',
          default: '30',
          description: 'Movies added within this many days are protected from rotation.',
          validation: { min: 0 },
        },
        {
          key: 'rotation_daily_additions',
          label: 'Daily Additions Limit',
          type: 'number',
          default: '2',
          validation: { min: 1 },
        },
        {
          key: 'rotation_leaving_days',
          label: 'Leaving Days',
          type: 'number',
          default: '7',
          description: 'How many days a movie is marked as "leaving" before removal.',
          validation: { min: 1 },
        },
      ],
    },
  ],
};
