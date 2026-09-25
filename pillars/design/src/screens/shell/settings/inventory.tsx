import { paperlessConnected, paperlessDown, savedSettings } from '@/fixtures/inventory/settings';
import { InventorySettings } from '@/kit/inventory/settings/inventory-settings';
import { INVENTORY_SETTING_KEYS as KEYS } from '@/kit/inventory/settings/inventory-settings-manifest';
import { initialSection, sectionReducer } from '@/kit/inventory/settings/settings-section-model';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { InventorySettingsProps } from '@/kit/inventory/settings/inventory-settings';

export const meta: ScreenMeta = { title: 'Inventory section', order: 1, frame: 'web' };

const connected = initialSection(savedSettings, paperlessConnected);

function section(overrides: Partial<InventorySettingsProps> = {}) {
  return function InventorySettingsState() {
    return (
      <InventorySettings
        initial={connected}
        tokenStored
        testAnswer={paperlessConnected}
        {...overrides}
      />
    );
  };
}

function changed(key: string, value: string) {
  return sectionReducer(connected, { type: 'change', key, value });
}

/**
 * `/settings#inventory`: Inventory's section of the shell's Settings app,
 * replacing the `/inventory/settings` page. Paperless's status and test are
 * the section's one widget; codes, label defaults and lists are declarative
 * fields, each saved on change. `saving` and `saved` stand where the page's
 * `unsaved` and `saved` were, since the Settings app has no Save button.
 */
export const states: ScreenStates = {
  'paperless-connected': section(),
  'paperless-down': section({
    initial: initialSection(savedSettings, paperlessDown),
    testAnswer: paperlessDown,
  }),
  'not-set-up': section({
    initial: initialSection({ ...savedSettings, [KEYS.paperlessUrl]: '' }, { kind: 'not-set-up' }),
    tokenStored: false,
  }),
  testing: section({
    initial: sectionReducer(initialSection(savedSettings, paperlessDown), { type: 'test-start' }),
  }),
  saving: section({ initial: changed(KEYS.codePattern, 'B{###}') }),
  'invalid-pattern': section({ initial: changed(KEYS.codePattern, '{type}-{room}') }),
  'codes-off': section({
    initial: initialSection({ ...savedSettings, [KEYS.suggestCodes]: 'false' }, paperlessConnected),
  }),
  saved: section({
    initial: sectionReducer(changed(KEYS.paperlessUrl, 'http://10.0.0.20:8000'), {
      type: 'saved',
      key: KEYS.paperlessUrl,
    }),
  }),
  loading: section({ status: 'loading' }),
  offline: section({ status: 'offline' }),
};

export default section();
