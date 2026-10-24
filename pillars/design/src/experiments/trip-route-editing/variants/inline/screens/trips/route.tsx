import { RoutePlanner } from '../../../../planner';

import type { ScreenMeta, ScreenStates } from '@/contract';

/** Route editing on the same fictional trip as the approved overview. */
export const meta: ScreenMeta = { title: 'Route planner', order: 2, frame: 'web' };

/** Review additions to empty, repeated-city and nested-trip routes. */
export const states: ScreenStates = {
  empty: () => <RoutePlanner layout="inline" scenario="empty" />,
  'repeat-visit': () => <RoutePlanner layout="inline" scenario="repeat-visit" />,
  'nested-trip': () => <RoutePlanner layout="inline" scenario="nested-trip" />,
};

/** inline proposal, pending approval. */
export default function RouteScreen() {
  return <RoutePlanner layout="inline" />;
}
