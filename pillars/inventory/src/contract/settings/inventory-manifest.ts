import {
  CODE_PATTERN_KEY,
  CODE_PATTERN_RULE,
  DEFAULT_CODE_PATTERN,
  SUGGEST_CODES_KEY,
} from './code-pattern.js';

/**
 * Inventory settings manifest — pagination, file limits, and search defaults.
 */
import type { SettingsManifest } from '@pops/types';

export const inventoryManifest: SettingsManifest = {
  id: 'inventory',
  title: 'Inventory',
  icon: 'Package',
  order: 150,
  groups: [
    {
      id: 'inventoryPagination',
      title: 'Pagination',
      description: 'Default page sizes for inventory list endpoints.',
      fields: [
        {
          key: 'inventory.defaultLimit',
          label: 'Default Page Size',
          type: 'number',
          default: '50',
          description: 'Default page size for items, connections, documents, and photos.',
          validation: { min: 1, max: 200 },
        },
        {
          key: 'inventory.searchDefaultLimit',
          label: 'Search Default Limit',
          type: 'number',
          default: '20',
          description: 'Default result limit for inventory search.',
          validation: { min: 1, max: 100 },
        },
      ],
    },
    {
      id: 'codes',
      title: 'Codes',
      description: 'The short code printed on a label. You can always type your own.',
      fields: [
        {
          key: SUGGEST_CODES_KEY,
          label: 'Suggest a code for new items',
          type: 'toggle',
          default: 'true',
          description: 'Taken codes are skipped; a collision still blocks saving the item.',
        },
        {
          key: CODE_PATTERN_KEY,
          label: 'Code pattern',
          type: 'text',
          default: DEFAULT_CODE_PATTERN,
          description:
            '{type} is the type’s first letter, X when untyped. {##} is the number, at least as many digits as #. Used while suggestions are on.',
          validation: {
            required: true,
            pattern: CODE_PATTERN_RULE,
            message: 'Use letters, digits, hyphens, {type}, and one {#} for the number.',
          },
        },
      ],
    },
    {
      id: 'documentFiles',
      title: 'Document Files',
      description: 'Upload constraints for inventory document attachments.',
      fields: [
        {
          key: 'inventory.maxFileSizeBytes',
          label: 'Max File Size (bytes)',
          type: 'number',
          default: '10485760',
          description: 'Maximum upload file size in bytes (default 10 MB).',
          validation: { min: 1048576 },
        },
      ],
    },
  ],
};
