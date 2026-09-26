/**
 * Inventory's section of the Settings app, as designed: the manifest the
 * inventory pillar would declare in place of today's (pagination and file
 * limits only). Everything is a declarative field the shell renders and
 * saves on its own, except Paperless's connection status and test, which
 * need a live call and so mount as the `inventory-paperless` widget above
 * the address field.
 */
import { describeLayout, SHEET_PRESETS } from '@pops/inventory/labels';

import { LABEL_PRESETS } from '../print/label-content';

import type { SettingsManifestDescriptor } from '@pops/pillar-sdk/manifest-schema';

/** The slot the Paperless status widget mounts in. */
export const PAPERLESS_WIDGET_SLOT = 'inventory-paperless';

/**
 * Letters, digits and hyphens, `{type}` anywhere, and exactly one `{#}` run
 * of one to six `#` for the number.
 */
export const CODE_PATTERN_RULE =
  '^(?:[A-Za-z0-9-]|\\{type\\})*\\{#{1,6}\\}(?:[A-Za-z0-9-]|\\{type\\})*$';

/** The setting keys the designed section adds or keeps. */
export const INVENTORY_SETTING_KEYS = {
  paperlessUrl: 'inventory.paperlessUrl',
  suggestCodes: 'inventory.suggestCodes',
  codePattern: 'inventory.codePattern',
  labelSheet: 'inventory.labelSheet',
  labelShows: 'inventory.labelShows',
  density: 'inventory.density',
  defaultLimit: 'inventory.defaultLimit',
  searchDefaultLimit: 'inventory.searchDefaultLimit',
  maxFileSizeBytes: 'inventory.maxFileSizeBytes',
} as const;

const KEYS = INVENTORY_SETTING_KEYS;

/** The designed Inventory section. */
export const inventorySettingsSection: SettingsManifestDescriptor = {
  id: 'inventory',
  title: 'Inventory',
  icon: 'Package',
  order: 150,
  groups: [
    {
      id: 'paperless',
      title: 'Paperless',
      description: 'Receipts, manuals and warranties live in Paperless; items link to them.',
      widget: { bundleSlot: PAPERLESS_WIDGET_SLOT },
      fields: [
        {
          key: KEYS.paperlessUrl,
          label: 'Address',
          type: 'url',
          description: 'Where Inventory reaches Paperless, e.g. https://paperless.home.',
        },
      ],
    },
    {
      id: 'codes',
      title: 'Codes',
      description: 'The short code printed on a label. You can always type your own.',
      fields: [
        {
          key: KEYS.suggestCodes,
          label: 'Suggest a code for new items',
          type: 'toggle',
          default: 'true',
          description: 'Taken codes are skipped; a collision still blocks saving the item.',
        },
        {
          key: KEYS.codePattern,
          label: 'Code pattern',
          type: 'text',
          default: '{type}{##}',
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
      id: 'labels',
      title: 'Labels',
      description: 'What the label page starts with. Each print can still change it.',
      fields: [
        {
          key: KEYS.labelSheet,
          label: 'Sheet',
          type: 'select',
          default: 'L7160',
          options: SHEET_PRESETS.map((layout) => ({
            value: layout.id,
            label: describeLayout(layout),
          })),
        },
        {
          key: KEYS.labelShows,
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
          key: KEYS.density,
          label: 'Row density',
          type: 'select',
          default: 'compact',
          options: [
            { value: 'compact', label: 'Compact, 36 px rows' },
            { value: 'comfortable', label: 'Comfortable, 44 px rows' },
          ],
        },
        {
          key: KEYS.defaultLimit,
          label: 'Rows per page',
          type: 'number',
          default: '50',
          description: 'How many rows a list loads at a time, 1 to 200.',
          validation: { min: 1, max: 200 },
        },
        {
          key: KEYS.searchDefaultLimit,
          label: 'Search results per page',
          type: 'number',
          default: '20',
          validation: { min: 1, max: 100 },
        },
      ],
    },
    {
      id: 'documentFiles',
      title: 'Document files',
      description: 'Upload limits for documents attached to items.',
      fields: [
        {
          key: KEYS.maxFileSizeBytes,
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
