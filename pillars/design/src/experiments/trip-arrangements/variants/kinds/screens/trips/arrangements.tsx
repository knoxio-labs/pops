import { ArrangementsWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Source-backed arrangements and coverage gaps without a second booking workflow. */
export const meta: ScreenMeta = { title: 'Arrangements', order: 8, frame: 'web' };

/** Review empty collections, unknown dates and unavailable or invalid source facts. */
export const states: ScreenStates = {
  empty: () => <ArrangementsWorkspace layout="kinds" scenario="empty" />,
  'unknown-dates': () => <ArrangementsWorkspace layout="kinds" scenario="unknown-dates" />,
  'missing-reference': () => <ArrangementsWorkspace layout="kinds" scenario="missing-reference" />,
  'invalid-policy': () => <ArrangementsWorkspace layout="kinds" scenario="invalid-policy" />,
};

/** Opens the kinds grouping over the same typed arrangement sources. */
export default function ArrangementsScreen() {
  return <ArrangementsWorkspace layout="kinds" />;
}
