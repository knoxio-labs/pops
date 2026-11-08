import { AlternativesWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Compare competing routes without discarding their arrangements. */
export const meta: ScreenMeta = { title: 'Alternatives', order: 7, frame: 'web' };

/** Review unknown dates, unavailable source references and date conflicts. */
export const states: ScreenStates = {
  empty: () => <AlternativesWorkspace layout="changes" scenario="empty" />,
  'date-conflict': () => <AlternativesWorkspace layout="changes" scenario="date-conflict" />,
  'missing-reference': () => (
    <AlternativesWorkspace layout="changes" scenario="missing-reference" />
  ),
};

/** Reviewable path comparison; choosing its presentation remains a user decision. */
export default function AlternativesScreen() {
  return <AlternativesWorkspace layout="changes" />;
}
