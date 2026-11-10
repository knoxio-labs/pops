import { DirectPlanner } from '../../../../direct';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Direct manipulation using the same fictional route as the earlier proposals. */
export const meta: ScreenMeta = { title: 'Route planner', order: 2, frame: 'web' };

/** Empty, repeated-city and flat return routes retain direct editing. */
export const states: ScreenStates = {
  empty: () => <DirectPlanner scenario="empty" />,
  'repeat-visit': () => <DirectPlanner scenario="repeat-visit" />,
  'alternative-paths': () => <DirectPlanner scenario="alternative-paths" />,
  'flat-return': () => <DirectPlanner scenario="flat-return" />,
};

/** Drag visits and edit their values directly; approval remains pending. */
export default function RouteScreen() {
  return <DirectPlanner />;
}
