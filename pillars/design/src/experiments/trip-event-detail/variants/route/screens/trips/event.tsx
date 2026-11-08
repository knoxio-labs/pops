import { EventWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Event details retain their source facts and show their effects on an editable route. */
export const meta: ScreenMeta = { title: 'Event detail', order: 4, frame: 'web' };

/** Review progressive capture, purchases, conflicts and unavailable references. */
export const states: ScreenStates = {
  new: () => <EventWorkspace layout="route" scenario="new" />,
  purchased: () => <EventWorkspace layout="route" scenario="purchased" />,
  'date-conflict': () => <EventWorkspace layout="route" scenario="date-conflict" />,
  'missing-reference': () => <EventWorkspace layout="route" scenario="missing-reference" />,
};

/** Reviewable proposal; choosing or approving it remains a user decision. */
export default function EventScreen() {
  return <EventWorkspace layout="route" />;
}
