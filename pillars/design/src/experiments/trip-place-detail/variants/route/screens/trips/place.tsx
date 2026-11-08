import { IdeaWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Editable destinations, places and activities with reasons and optional planning context. */
export const meta: ScreenMeta = { title: 'Place / idea detail', order: 10, frame: 'web' };

/** Review optional timing, empty capture, route discrepancies and unavailable references. */
export const states: ScreenStates = {
  empty: () => <IdeaWorkspace layout="route" scenario="empty" />,
  undated: () => <IdeaWorkspace layout="route" scenario="undated" />,
  'outside-visit': () => <IdeaWorkspace layout="route" scenario="outside-visit" />,
  'missing-reference': () => <IdeaWorkspace layout="route" scenario="missing-reference" />,
};

/** Comparable idea editor; layout approval remains a user decision. */
export default function IdeaScreen() {
  return <IdeaWorkspace layout="route" />;
}
