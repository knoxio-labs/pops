import { TripOverviewPrototype } from '../../../../overview';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** This variant is a proposal, not an approved product design. */
export const meta: ScreenMeta = { title: 'Trip overview', order: 1, frame: 'web' };

/** Review empty, minimally planned and newly disrupted versions of the same trip. */
export const states: ScreenStates = {
  empty: () => <TripOverviewPrototype layout="places-first" scenario="empty" />,
  'anchors-only': () => <TripOverviewPrototype layout="places-first" scenario="anchors-only" />,
  'event-discovered': () => (
    <TripOverviewPrototype layout="places-first" scenario="event-discovered" />
  ),
};

/** The places-first overview using the shared fictional trip. */
export default function OverviewScreen() {
  return <TripOverviewPrototype layout="places-first" />;
}
