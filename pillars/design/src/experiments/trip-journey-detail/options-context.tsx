import { createContext, useContext } from 'react';

import type { JourneyOptionsState } from './option-model';

/** Current journey and alternatives share the workspace undo history. */
export const JourneyOptionsContext = createContext<
  | {
      state: JourneyOptionsState;
      change: (state: JourneyOptionsState) => void;
    }
  | undefined
>(undefined);

/** Read alternatives without implicitly selecting their source journey. */
export function useJourneyOptions() {
  const context = useContext(JourneyOptionsContext);
  if (!context) throw new Error('Journey options workspace missing');
  return context;
}
