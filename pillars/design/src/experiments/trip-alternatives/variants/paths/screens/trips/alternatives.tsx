import { AlternativesWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Compare competing routes without discarding their arrangements. */
export const meta: ScreenMeta = { title: 'Alternatives', order: 7, frame: 'web' };

/** Review unknown dates, unavailable source references and date conflicts. */
export const states: ScreenStates = {
  empty: () => <AlternativesWorkspace layout="paths" scenario="empty" />,
  'date-conflict': () => <AlternativesWorkspace layout="paths" scenario="date-conflict" />,
  'missing-reference': () => <AlternativesWorkspace layout="paths" scenario="missing-reference" />,
};

/** Reviewable path comparison; choosing its presentation remains a user decision. */
export default function AlternativesScreen() {
  return <AlternativesWorkspace layout="paths" />;
}
