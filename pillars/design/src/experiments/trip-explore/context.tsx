import { createContext, useContext } from 'react';

import type { ExploreState } from './model';

/** Shares source records and one local undo history across the explore views. */
export const ExploreContext = createContext<
  { state: ExploreState; change: (next: ExploreState) => void } | undefined
>(undefined);

/** Reads the fictional collection without a production client or remote writes. */
export function useExplore() {
  const context = useContext(ExploreContext);
  if (!context) throw new Error('Explore context missing');
  return context;
}
