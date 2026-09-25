/**
 * Saved inventory settings and what Paperless can answer, for the settings
 * page states. The address is a fictional home-network host.
 */
import type { InventorySettings, PaperlessStatus } from '@/kit/inventory/settings/settings-model';

/** The settings as saved. */
export const savedSettings: InventorySettings = {
  paperlessUrl: 'https://paperless.wattle.home',
  paperlessTokenSet: true,
  suggestCodes: true,
  codePattern: '{type}{##}',
  labelSheetId: 'L7160',
  labelTemplate: 'auto',
  density: 'compact',
};

/** Paperless answering. */
export const paperlessConnected: PaperlessStatus = {
  kind: 'connected',
  url: savedSettings.paperlessUrl,
  documents: 1284,
  checked: 'today at 9:02',
};

/** Paperless not answering. */
export const paperlessDown: PaperlessStatus = {
  kind: 'unreachable',
  url: savedSettings.paperlessUrl,
  reason: 'The address did not answer within 10 seconds.',
  checked: 'today at 9:14',
};
