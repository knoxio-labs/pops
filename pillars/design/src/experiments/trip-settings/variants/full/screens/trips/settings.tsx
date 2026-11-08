import { SettingsWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Create and revise a trip with a When subtitle, shared tag and parent trip. */
export const meta: ScreenMeta = { title: 'Trip creation and settings', order: 12, frame: 'web' };

/** Review empty capture, existing edits, nesting, uncertain timing and unavailable references. */
export const states: ScreenStates = {
  empty: () => <SettingsWorkspace layout="full" scenario="empty" />,
  existing: () => <SettingsWorkspace layout="full" scenario="existing" />,
  nested: () => <SettingsWorkspace layout="full" scenario="nested" />,

  month: () => <SettingsWorkspace layout="full" scenario="month" />,
  season: () => <SettingsWorkspace layout="full" scenario="season" />,
  'open-route': () => <SettingsWorkspace layout="full" scenario="open-route" />,
  'arbitrary-when': () => <SettingsWorkspace layout="full" scenario="arbitrary-when" />,
  'missing-reference': () => <SettingsWorkspace layout="full" scenario="missing-reference" />,
};

/** Both proposals share the same editable source values and save semantics. */
export default function TripSettingsScreen() {
  return <SettingsWorkspace layout="full" />;
}
