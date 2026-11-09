import { createContext, useContext } from 'react';

import type { ArrangementState } from './model';

/** Shares local responsibility assignments without changing booking source facts. */
export const ArrangementsContext = createContext<
  { state: ArrangementState; change: (next: ArrangementState) => void } | undefined
>(undefined);

/** Reads the active fictional arrangement snapshot and local assignment action. */
export function useArrangements() {
  const context = useContext(ArrangementsContext);
  if (!context) throw new Error('Arrangements context missing');
  return context;
}
