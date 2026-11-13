import { CraftWorkspaceView } from '@/experiments/trip-timeline-craft/workspace';
import { craftTimeline, sparseCraftTimeline } from '@/fixtures/trip-timeline-craft';
import { craftSpendingStates } from '@/fixtures/trip-timeline-spending';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type {
  CraftFinanceIntent,
  CraftSpendingState,
  CraftTimeline,
} from '@/fixtures/trip-timeline-craft';

/** A single exploratory web Timeline, using the wrapping header and fictional source data. */
export const meta: ScreenMeta = { title: 'Timeline · craft candidate', order: 0, frame: 'web' };

/** The preview renders fictional records and shows Finance handoffs without performing writes. */
export default function TripTimelineCraft({
  timeline = craftTimeline,
  spending = craftSpendingStates.ready,
  onFinanceIntent,
}: {
  timeline?: CraftTimeline;
  spending?: CraftSpendingState;
  onFinanceIntent?: (intent: CraftFinanceIntent) => void;
}) {
  return (
    <CraftWorkspaceView timeline={timeline} spending={spending} onFinanceIntent={onFinanceIntent} />
  );
}

/** Named read and recovery states stay within the same Trip Timeline destination. */
export const states: ScreenStates = {
  'date-only-and-unknown': () => <TripTimelineCraft timeline={sparseCraftTimeline} />,
  'spending-empty': () => <TripTimelineCraft spending={craftSpendingStates.empty} />,
  'spending-tag-missing': () => <TripTimelineCraft spending={craftSpendingStates.missingTag} />,
  'spending-loading': () => <TripTimelineCraft spending={craftSpendingStates.loading} />,
  'spending-unavailable': () => <TripTimelineCraft spending={craftSpendingStates.unavailable} />,
  'spending-partial': () => <TripTimelineCraft spending={craftSpendingStates.partial} />,
  'spending-creating': () => <TripTimelineCraft spending={craftSpendingStates.creating} />,
  'spending-link-retry': () => (
    <TripTimelineCraft spending={craftSpendingStates.attachmentFailed} />
  ),
  'spending-uncertain-create': () => (
    <TripTimelineCraft spending={craftSpendingStates.uncertainCreate} />
  ),
  'spending-select-existing': () => (
    <TripTimelineCraft spending={craftSpendingStates.chooseExisting} />
  ),
  'spending-linked': () => <TripTimelineCraft spending={craftSpendingStates.linked} />,
};
