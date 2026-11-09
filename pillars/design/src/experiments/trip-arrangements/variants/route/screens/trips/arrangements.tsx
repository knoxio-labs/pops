import { ArrangementsWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Source-backed arrangements and coverage gaps without a second booking workflow. */
export const meta: ScreenMeta = { title: 'Arrangements', order: 8, frame: 'web' };

/** Review empty collections, unknown dates and unavailable or invalid source facts. */
export const states: ScreenStates = {
  empty: () => <ArrangementsWorkspace layout="route" scenario="empty" />,
  'unknown-dates': () => <ArrangementsWorkspace layout="route" scenario="unknown-dates" />,
  'missing-reference': () => <ArrangementsWorkspace layout="route" scenario="missing-reference" />,
  'invalid-policy': () => <ArrangementsWorkspace layout="route" scenario="invalid-policy" />,
};

/** Opens the route grouping over the same typed arrangement sources. */
export default function ArrangementsScreen() {
  return <ArrangementsWorkspace layout="route" />;
}
