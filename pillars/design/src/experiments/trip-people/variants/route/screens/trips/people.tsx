import { TripPeopleWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Existing contacts, explicit meeting plans and bounded source availability. */
export const meta: ScreenMeta = { title: 'Trip people', order: 9, frame: 'web' };

/** Review empty links, contradictory statements, unavailable references and unknown visit dates. */
export const states: ScreenStates = {
  empty: () => <TripPeopleWorkspace layout="route" scenario="empty" />,
  conflicting: () => <TripPeopleWorkspace layout="route" scenario="conflicting" />,
  'missing-reference': () => <TripPeopleWorkspace layout="route" scenario="missing-reference" />,
  'unknown-dates': () => <TripPeopleWorkspace layout="route" scenario="undated" />,
};

/** Opens the route grouping over the same people and meeting source identities. */
export default function TripPeopleScreen() {
  return <TripPeopleWorkspace layout="route" />;
}
