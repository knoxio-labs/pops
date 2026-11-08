import { createContext, useContext } from 'react';

import type { StayState } from './model';

/** One source snapshot and undo history feed both stay presentations. */
export const StayContext = createContext<
  | {
      state: StayState;
      change: (next: StayState) => void;
    }
  | undefined
>(undefined);

/** Read the mounted stay editor without introducing a second source of booking facts. */
export function useStay() {
  const context = useContext(StayContext);
  if (!context) throw new Error('Stay workspace missing');
  return context;
}
