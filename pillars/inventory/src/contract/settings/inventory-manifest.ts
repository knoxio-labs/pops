import { DEFAULT_SHEET_ID, LABEL_PRESETS, SHEET_PRESETS, describeLayout } from '../labels/index.js';
import {
  CODE_PATTERN_KEY,
  CODE_PATTERN_RULE,
  DEFAULT_CODE_PATTERN,
  SUGGEST_CODES_KEY,
} from './code-pattern.js';

import type { SettingsManifest } from '@pops/types';

/** Inventory settings manifest consumed by the shell Settings app and settings API. */
export const inventoryManifest: SettingsManifest = {
  id: 'inventory',
  title: 'Inventory',
  icon: 'Package',
  order: 150,
  groups: [
    {
      id: 'paperless',
      title: 'Paperless',
      description: 'Receipts, manuals and warranties live in Paperless; items link to them.',
      widget: { bundleSlot: 'inventory-paperless' },
      fields: [],
    },
    {
      id: 'labels',
      title: 'Labels',
      description: 'What the label page starts with. Each print can still change it.',
      fields: [
        {
          key: 'inventory.labelSheet',
          label: 'Sheet',
          type: 'select',
          default: DEFAULT_SHEET_ID,
          options: SHEET_PRESETS.map((layout) => ({
            value: layout.id,
            label: describeLayout(layout),
          })),
        },
        {
          key: 'inventory.labelShows',
          label: 'Label shows',
          type: 'select',
          default: 'auto',
          options: LABEL_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
          description: 'Auto gives boxes their name as well as the QR and code.',
        },
      ],
    },
    {
      id: 'lists',
      title: 'Lists',
      description: 'Items, Containers, search and every other inventory list.',
      fields: [
        {
          key: 'inventory.density',
          label: 'Row density',
          type: 'select',
          default: 'compact',
          options: [
            { value: 'compact', label: 'Compact, 36 px rows' },
            { value: 'comfortable', label: 'Comfortable, 44 px rows' },
          ],
        },
        {
          key: 'inventory.defaultLimit',
          label: 'Rows per page',
          type: 'number',
          default: '50',
          description: 'How many rows a list loads at a time, 1 to 200.',
          validation: { min: 1, max: 200 },
        },
        {
          key: 'inventory.searchDefaultLimit',
          label: 'Search results per page',
          type: 'number',
          default: '20',
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
      title: 'Document files',
      description: 'Upload limits for documents attached to items.',
      fields: [
        {
          key: 'inventory.maxFileSizeBytes',
          label: 'Largest upload, in bytes',
          type: 'number',
          default: '10485760',
          description: '10485760 is 10 MB.',
          validation: { min: 1048576 },
        },
      ],
    },
  ],
};
