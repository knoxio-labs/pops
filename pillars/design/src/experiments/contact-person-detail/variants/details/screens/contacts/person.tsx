import { PersonWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Direct person editing with repeatable contact facts and trip context. */
export const meta: ScreenMeta = { title: 'Person detail', order: 5, frame: 'web' };

/** Review progressive capture, contradictory dates and unavailable visit references. */
export const states: ScreenStates = {
  new: () => <PersonWorkspace layout="details" scenario="new" />,
  conflicting: () => <PersonWorkspace layout="details" scenario="conflicting" />,
  'missing-reference': () => <PersonWorkspace layout="details" scenario="missing-reference" />,
};

/** Reviewable section priority proposal. */
export default function PersonScreen() {
  return <PersonWorkspace layout="details" />;
}
