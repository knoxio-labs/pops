import { DecisionWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** A question with competing options and explicitly linked source plans. */
export const meta: ScreenMeta = { title: 'Decision detail', order: 11, frame: 'web' };

/** Review blank, selected, invalid-date and unavailable-reference decisions. */
export const states: ScreenStates = {
  empty: () => <DecisionWorkspace layout="impact" scenario="empty" />,
  selected: () => <DecisionWorkspace layout="impact" scenario="selected" />,
  'missing-reference': () => <DecisionWorkspace layout="impact" scenario="missing-reference" />,
  'invalid-deadline': () => <DecisionWorkspace layout="impact" scenario="invalid-deadline" />,
};

/** Interactive decision proposal with local editing and undo. */
export default function DecisionScreen() {
  return <DecisionWorkspace layout="impact" />;
}
