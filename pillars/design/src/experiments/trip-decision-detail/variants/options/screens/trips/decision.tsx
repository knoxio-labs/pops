import { DecisionWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** A question with competing options and explicitly linked source plans. */
export const meta: ScreenMeta = { title: 'Decision detail', order: 11, frame: 'web' };

/** Review blank, selected, invalid-date and unavailable-reference decisions. */
export const states: ScreenStates = {
  empty: () => <DecisionWorkspace layout="options" scenario="empty" />,
  selected: () => <DecisionWorkspace layout="options" scenario="selected" />,
  'missing-reference': () => <DecisionWorkspace layout="options" scenario="missing-reference" />,
  'invalid-deadline': () => <DecisionWorkspace layout="options" scenario="invalid-deadline" />,
};

/** Interactive decision proposal with local editing and undo. */
export default function DecisionScreen() {
  return <DecisionWorkspace layout="options" />;
}
