import { paperlessConnected, paperlessDown, savedSettings } from '@/fixtures/inventory/settings';
import { initialSettings, settingsReducer } from '@/kit/inventory/settings/settings-model';
import { SettingsPage } from '@/kit/inventory/settings/settings-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { SettingsPageProps } from '@/kit/inventory/settings/settings-page';

export const meta: ScreenMeta = { title: 'Settings', order: 20, frame: 'web' };

const connected = initialSettings(savedSettings, paperlessConnected);

function page(overrides: Partial<SettingsPageProps> = {}) {
  return function SettingsState() {
    return <SettingsPage initial={connected} {...overrides} />;
  };
}

const edited = initialSettings(savedSettings, paperlessConnected, {
  codePattern: 'B{###}',
  density: 'comfortable',
});

/**
 * `/inventory/settings`: Paperless connection, code suggestion pattern,
 * label defaults and list density. The default state has Paperless connected.
 */
export const states: ScreenStates = {
  'paperless-connected': page(),
  'paperless-down': page({ initial: initialSettings(savedSettings, paperlessDown) }),
  'not-set-up': page({
    initial: initialSettings(
      { ...savedSettings, paperlessUrl: '', paperlessTokenSet: false },
      { kind: 'not-set-up' }
    ),
  }),
  testing: page({
    initial: settingsReducer(
      initialSettings(savedSettings, paperlessDown, { paperlessUrl: 'http://10.0.0.20:8000' }),
      { type: 'test-start' }
    ),
  }),
  unsaved: page({ initial: edited }),
  'invalid-pattern': page({
    initial: initialSettings(savedSettings, paperlessConnected, { codePattern: '{type}-{room}' }),
  }),
  'codes-off': page({
    initial: initialSettings(savedSettings, paperlessConnected, { suggestCodes: false }),
  }),
  saved: page({ initial: settingsReducer(edited, { type: 'save' }) }),
  loading: page({ status: 'loading' }),
  offline: page({ banner: 'offline', initial: edited }),
};

export default page();
