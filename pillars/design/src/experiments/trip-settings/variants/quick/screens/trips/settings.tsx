import { SettingsWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Create and revise a trip with optional dates, shared tag and parent trip. */
export const meta: ScreenMeta = { title: 'Trip creation and settings', order: 12, frame: 'web' };

/** Review empty capture, existing edits, nesting, invalid dates and unavailable references. */
export const states: ScreenStates = {
  empty: () => <SettingsWorkspace layout="quick" scenario="empty" />,
  existing: () => <SettingsWorkspace layout="quick" scenario="existing" />,
  nested: () => <SettingsWorkspace layout="quick" scenario="nested" />,
  'reversed-dates': () => <SettingsWorkspace layout="quick" scenario="reversed-dates" />,
  'missing-reference': () => <SettingsWorkspace layout="quick" scenario="missing-reference" />,
};

/** Both proposals share the same editable source values and save semantics. */
export default function TripSettingsScreen() {
  return <SettingsWorkspace layout="quick" />;
}
