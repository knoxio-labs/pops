import { ExploreWorkspace } from '../../../../workspace';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Collects source-backed possibilities before committing them to dates. */
export const meta: ScreenMeta = { title: 'Explore', order: 5, frame: 'web' };

/** Review empty collections, undated sources and unavailable references. */
export const states: ScreenStates = {
  empty: () => <ExploreWorkspace layout="collection" scenario="empty" />,
  undated: () => <ExploreWorkspace layout="collection" scenario="undated" />,
  'missing-reference': () => <ExploreWorkspace layout="collection" scenario="missing-reference" />,
};

/** Opens the collection proposal over the same editable source identities. */
export default function ExploreScreen() {
  return <ExploreWorkspace layout="collection" />;
}
