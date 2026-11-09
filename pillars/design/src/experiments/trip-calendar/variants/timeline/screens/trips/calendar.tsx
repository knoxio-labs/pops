import { TripCalendarWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Explicit calendar dates, display zone, kind filters and selected source inspection. */
export const meta: ScreenMeta = { title: 'Trip calendar', order: 4, frame: 'web' };

/** Review empty projections, flight windows, missing clocks and date-line travel. */
export const states: ScreenStates = {
  empty: () => <TripCalendarWorkspace layout="timeline" scenario="empty" />,
  'flight-window': () => <TripCalendarWorkspace layout="timeline" scenario="flight-window" />,
  'missing-time': () => <TripCalendarWorkspace layout="timeline" scenario="missing-time" />,
  'invalid-range': () => <TripCalendarWorkspace layout="timeline" scenario="invalid-range" />,
  'date-line': () => <TripCalendarWorkspace layout="timeline" scenario="date-line" />,
};

/** Opens the timeline calendar proposal over identical source facts. */
export default function CalendarScreen() {
  return <TripCalendarWorkspace layout="timeline" />;
}
