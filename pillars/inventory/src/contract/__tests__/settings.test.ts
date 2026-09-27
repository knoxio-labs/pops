import { describe, expect, it } from 'vitest';

import { DEFAULT_SHEET_ID, LABEL_PRESETS, SHEET_PRESETS } from '../labels/index.js';
import {
  CODE_PATTERN_KEY,
  CODE_PATTERN_RULE,
  DEFAULT_CODE_PATTERN,
  SUGGEST_CODES_KEY,
} from '../settings/code-pattern.js';
import { inventoryManifest } from '../settings/index.js';

describe('inventoryManifest', () => {
  it('still loads with id "inventory"', () => {
    expect(inventoryManifest.id).toBe('inventory');
  });

  it('declares code suggestions with their defaults and rule', () => {
    const codes = inventoryManifest.groups.find((group) => group.id === 'codes');
    expect(codes?.fields).toEqual([
      expect.objectContaining({ key: SUGGEST_CODES_KEY, default: 'true' }),
      expect.objectContaining({
        key: CODE_PATTERN_KEY,
        default: DEFAULT_CODE_PATTERN,
        validation: expect.objectContaining({ pattern: CODE_PATTERN_RULE }),
      }),
    ]);
  });

  it('declares labels and list defaults from the shared label vocabulary', () => {
    const labels = inventoryManifest.groups.find((group) => group.id === 'labels');
    const lists = inventoryManifest.groups.find((group) => group.id === 'lists');

    expect(labels?.fields).toEqual([
      expect.objectContaining({
        key: 'inventory.labelSheet',
        default: DEFAULT_SHEET_ID,
        options: SHEET_PRESETS.map((layout) => expect.objectContaining({ value: layout.id })),
      }),
      expect.objectContaining({
        key: 'inventory.labelShows',
        default: 'auto',
        options: LABEL_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
      }),
    ]);
    expect(lists?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'inventory.density', default: 'compact' }),
        expect.objectContaining({ key: 'inventory.defaultLimit', default: '50' }),
        expect.objectContaining({ key: 'inventory.searchDefaultLimit', default: '20' }),
      ])
    );
  });

  it('declares the Paperless status widget without local settings fields', () => {
    expect(inventoryManifest.groups.find((group) => group.id === 'paperless')).toEqual({
      id: 'paperless',
      title: 'Paperless',
      description: 'Receipts, manuals and warranties live in Paperless; items link to them.',
      widget: { bundleSlot: 'inventory-paperless' },
      fields: [],
    });
  });

  it('keeps every declared key unique and every select default selectable', () => {
    const fields = inventoryManifest.groups.flatMap((group) => group.fields);
    expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    for (const field of fields.filter((entry) => entry.type === 'select')) {
      expect(field.options?.map((option) => option.value)).toContain(field.default);
    }
  });

  it('keeps the document-file limit in the settings section', () => {
    expect(inventoryManifest.groups.find((group) => group.id === 'documentFiles')).toEqual(
      expect.objectContaining({
        title: 'Document files',
        fields: [expect.objectContaining({ key: 'inventory.maxFileSizeBytes' })],
      })
    );
  });
});
