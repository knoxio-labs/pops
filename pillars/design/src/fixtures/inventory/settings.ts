/**
 * Inventory's saved settings, by Settings app key, and what Paperless can
 * answer, for the Settings app section states. The address is a fictional
 * home-network host.
 */
import { INVENTORY_SETTING_KEYS as KEYS } from '@/kit/inventory/settings/inventory-settings-manifest';

import type { PaperlessAnswer } from '@/kit/inventory/settings/paperless-widget';

/** The settings as saved. */
export const savedSettings: Readonly<Record<string, string>> = {
  [KEYS.paperlessUrl]: 'https://paperless.wattle.home',
  [KEYS.suggestCodes]: 'true',
  [KEYS.codePattern]: '{type}{##}',
  [KEYS.labelSheet]: 'L7160',
  [KEYS.labelShows]: 'auto',
  [KEYS.density]: 'compact',
  [KEYS.defaultLimit]: '50',
  [KEYS.searchDefaultLimit]: '20',
  [KEYS.maxFileSizeBytes]: '10485760',
};

/** Paperless answering. */
export const paperlessConnected: PaperlessAnswer = {
  kind: 'connected',
  url: 'https://paperless.wattle.home',
  documents: 1284,
  checked: 'today at 9:02',
};

/** Paperless not answering. */
export const paperlessDown: PaperlessAnswer = {
  kind: 'unreachable',
  url: 'https://paperless.wattle.home',
  reason: 'The address did not answer within 10 seconds.',
  checked: 'today at 9:14',
};
