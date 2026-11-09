import { BusinessWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Business and organisation facts with editable locations and reusable people. */
export const meta: ScreenMeta = { title: 'Business detail', order: 6, frame: 'web' };

/** Fictional empty, organisation and unresolved-reference review states. */
export const states: ScreenStates = {
  empty: () => <BusinessWorkspace layout="details" scenario="empty" />,
  organisation: () => <BusinessWorkspace layout="details" scenario="organisation" />,
  'missing-reference': () => <BusinessWorkspace layout="details" scenario="missing-reference" />,
};

/** Opens the details-first grouping with identical source data and editing controls. */
export default function BusinessScreen() {
  return <BusinessWorkspace layout="details" />;
}
