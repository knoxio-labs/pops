import { TripsHomeWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Compact trip browsing and approved optional-metadata creation. */
export const meta: ScreenMeta = { title: 'Trips', order: 10, frame: 'web' };

/** Fictional blank, open-boundary, unavailable-parent and contradictory-route review states. */
export const states: ScreenStates = {
  default: () => <TripsHomeWorkspace layout="grouped" />,
  empty: () => <TripsHomeWorkspace layout="grouped" scenario="empty" />,
  'open-dates': () => <TripsHomeWorkspace layout="grouped" scenario="open-dates" />,
  'missing-parent': () => <TripsHomeWorkspace layout="grouped" scenario="missing-parent" />,
  'conflicting-dates': () => <TripsHomeWorkspace layout="grouped" scenario="conflicting-dates" />,
};

/** Opens the grouped projection over identical trip and route facts. */
export default function TripsHomeScreen() {
  return <TripsHomeWorkspace layout="grouped" />;
}
