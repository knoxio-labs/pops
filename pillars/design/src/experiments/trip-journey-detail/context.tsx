import { createContext, useContext } from 'react';

import type { JourneyLeg, JourneyState } from './model';

/** Source edits share undo; drag previews never commit booking facts. */
export interface JourneyActions {
  state: JourneyState;
  preview: JourneyState;
  change: (state: JourneyState) => void;
  previewLegs: (legs: JourneyLeg[] | null) => void;
}

/** Local prototype context; source data stays inside the mounted workspace. */
export const JourneyContext = createContext<JourneyActions | undefined>(undefined);

/** Read journey source and preview actions from their mounted workspace. */
export function useJourney(): JourneyActions {
  const context = useContext(JourneyContext);
  if (!context) throw new Error('Journey workspace missing');
  return context;
}
