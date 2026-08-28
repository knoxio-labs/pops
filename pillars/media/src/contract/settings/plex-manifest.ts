/**
 * Plex settings section. The `account` group carries a `widget.bundleSlot`
 * rather than fields: the shell resolves `'plex-connect'` through its
 * workspace bundle map and mounts the media app's PIN-handshake panel there,
 * so linking an account never requires pasting a raw token.
 */
import type { SettingsManifest } from '@pops/types';

export const plexManifest: SettingsManifest = {
  id: 'media.plex',
  title: 'Plex',
  icon: 'Film',
  order: 100,
  groups: [
    {
      id: 'account',
      title: 'Plex Account',
      description: 'Link your plex.tv account with a PIN instead of pasting a token.',
      widget: { bundleSlot: 'plex-connect' },
      fields: [],
    },
    {
      id: 'connection',
      title: 'Connection',
      fields: [
        { key: 'plex_url', label: 'Plex URL', type: 'url' },
        {
          key: 'plex_token',
          label: 'Plex Token',
          type: 'password',
          sensitive: true,
          testAction: { procedure: 'media.plex.testConnection', label: 'Test Connection' },
        },
      ],
    },
    {
      id: 'library',
      title: 'Library',
      description: 'Enter the Plex library section IDs to sync.',
      fields: [
        {
          key: 'plex_movie_section_id',
          label: 'Movie Library Section',
          type: 'text',
          description: 'Enter the Plex movie library section ID.',
        },
        {
          key: 'plex_tv_section_id',
          label: 'TV Library Section',
          type: 'text',
          description: 'Enter the Plex TV library section ID.',
        },
      ],
    },
    {
      id: 'sync',
      title: 'Sync',
      fields: [
        { key: 'plex_scheduler_enabled', label: 'Auto Sync', type: 'toggle' },
        {
          key: 'plex_scheduler_interval_ms',
          label: 'Sync Interval',
          type: 'duration',
          description: 'How often to sync the Plex library.',
        },
      ],
    },
  ],
};
