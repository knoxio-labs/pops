import { useQuery } from '@tanstack/react-query';

import {
  DEFAULT_SHEET_ID,
  DEFAULT_LABEL_CONTENT,
  findPreset,
  presetById,
  type LabelPresetId,
  type LabelContent,
  type LabelTemplateChoice,
} from '@pops/inventory/labels';

import { unwrap } from '../inventory-api-helpers.js';
import { settingsList } from '../inventory-api/index.js';

import type { UseQueryResult } from '@tanstack/react-query';

import type { InventoryApiError } from '../inventory-api-helpers.js';
import type { SettingsListResponses } from '../inventory-api/types.gen.js';

/** The inventory settings consumed by list and label-page defaults. */
export interface InventoryDefaults {
  readonly labelSheet: string;
  readonly labelShows: LabelPresetId;
  readonly density: 'compact' | 'comfortable';
}

/** The inventory setting keys read by the web defaults query. */
export const INVENTORY_SETTING_KEYS = {
  labelSheet: 'inventory.labelSheet',
  labelShows: 'inventory.labelShows',
  density: 'inventory.density',
} as const;

/** Safe defaults used before settings load and when a stored value is invalid. */
export const DEFAULT_INVENTORY_DEFAULTS: InventoryDefaults = {
  labelSheet: DEFAULT_SHEET_ID,
  labelShows: 'auto',
  density: 'compact',
};

/** The settings query key shared by inventory consumers of stored defaults. */
export const INVENTORY_DEFAULTS_QUERY_KEY = ['inventory', 'settings', 'defaults'] as const;

type InventorySetting = SettingsListResponses[200]['data'][number];

function valueFor(settings: readonly InventorySetting[], key: string): string | undefined {
  return settings.find((setting) => setting.key === key)?.value;
}

/** Maps the currently supported label-show presets to the existing job templates. */
export function labelTemplateForShows(shows: LabelPresetId): LabelTemplateChoice {
  if (shows === 'qr-name-code') return 'container';
  if (shows === 'qr-code') return 'item';
  return 'auto';
}

/** Maps the stored label-show preset to the shared label-content choice. */
export function labelContentForShows(shows: LabelPresetId): LabelContent {
  return presetById(shows)?.content ?? DEFAULT_LABEL_CONTENT;
}

/**
 * Validates the settings response used by the web defaults query. Unknown
 * sheets, label presets, and density values fall back to the contract defaults.
 */
export function parseInventoryDefaults(settings: readonly InventorySetting[]): InventoryDefaults {
  const sheet = valueFor(settings, INVENTORY_SETTING_KEYS.labelSheet);
  const shows = valueFor(settings, INVENTORY_SETTING_KEYS.labelShows);
  const density = valueFor(settings, INVENTORY_SETTING_KEYS.density);

  return {
    labelSheet: sheet !== undefined && findPreset(sheet) !== null ? sheet : DEFAULT_SHEET_ID,
    labelShows: presetById(shows ?? null)?.id ?? DEFAULT_INVENTORY_DEFAULTS.labelShows,
    density: density === 'comfortable' ? 'comfortable' : DEFAULT_INVENTORY_DEFAULTS.density,
  };
}

/** Reads and validates the inventory defaults exposed by `GET /settings`. */
export function useInventoryDefaults(): UseQueryResult<InventoryDefaults, InventoryApiError> {
  return useQuery<InventoryDefaults, InventoryApiError>({
    queryKey: INVENTORY_DEFAULTS_QUERY_KEY,
    queryFn: async () => parseInventoryDefaults(unwrap(await settingsList()).data),
    refetchOnWindowFocus: false,
  });
}
