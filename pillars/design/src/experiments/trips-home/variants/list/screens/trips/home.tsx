import { TripsHomeWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Compact trip browsing and approved optional-metadata creation. */
export const meta: ScreenMeta = { title: 'Trips', order: 10, frame: 'web' };

/** Fictional blank, open-boundary, unavailable-parent and contradictory-route review states. */
export const states: ScreenStates = {
  default: () => <TripsHomeWorkspace layout="list" />,
  empty: () => <TripsHomeWorkspace layout="list" scenario="empty" />,
  'open-dates': () => <TripsHomeWorkspace layout="list" scenario="open-dates" />,
  'missing-parent': () => <TripsHomeWorkspace layout="list" scenario="missing-parent" />,
  'conflicting-dates': () => <TripsHomeWorkspace layout="list" scenario="conflicting-dates" />,
};

/** Opens the list projection over identical trip and route facts. */
export default function TripsHomeScreen() {
  return <TripsHomeWorkspace layout="list" />;
}
