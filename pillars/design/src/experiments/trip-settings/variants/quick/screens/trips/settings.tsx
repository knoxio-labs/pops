import { SettingsWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Create and revise a trip with a When subtitle, shared tag and parent trip. */
export const meta: ScreenMeta = { title: 'Trip creation and settings', order: 12, frame: 'web' };

/** Review empty capture, existing edits, nesting, uncertain timing and unavailable references. */
export const states: ScreenStates = {
  empty: () => <SettingsWorkspace layout="quick" scenario="empty" />,
  existing: () => <SettingsWorkspace layout="quick" scenario="existing" />,
  nested: () => <SettingsWorkspace layout="quick" scenario="nested" />,

  month: () => <SettingsWorkspace layout="quick" scenario="month" />,
  season: () => <SettingsWorkspace layout="quick" scenario="season" />,
  'open-route': () => <SettingsWorkspace layout="quick" scenario="open-route" />,
  'arbitrary-when': () => <SettingsWorkspace layout="quick" scenario="arbitrary-when" />,
  'missing-reference': () => <SettingsWorkspace layout="quick" scenario="missing-reference" />,
};

/** Both proposals share the same editable source values and save semantics. */
export default function TripSettingsScreen() {
  return <SettingsWorkspace layout="quick" />;
}
