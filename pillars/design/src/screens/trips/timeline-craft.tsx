import { CraftWorkspaceView } from '@/experiments/trip-timeline-craft/workspace';
import { craftTimeline, sparseCraftTimeline } from '@/fixtures/trip-timeline-craft';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { CraftTimeline } from '@/fixtures/trip-timeline-craft';

/** A single exploratory web Timeline, using the wrapping header and fictional source data. */
export const meta: ScreenMeta = { title: 'Timeline · craft candidate', order: 0, frame: 'web' };

/** Local interactions expose the candidate hierarchy without production records or commands. */
export default function TripTimelineCraft({
  timeline = craftTimeline,
}: {
  timeline?: CraftTimeline;
}) {
  return <CraftWorkspaceView timeline={timeline} />;
}

/** Sparse data uses the same hierarchy rather than a separate interface or variant. */
export const states: ScreenStates = {
  'date-only-and-unknown': () => <TripTimelineCraft timeline={sparseCraftTimeline} />,
};
