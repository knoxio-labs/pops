import { createContext, useContext } from 'react';

import type { DecisionState } from './model';

/** Shared source snapshot for both decision projections. */
export const DecisionContext = createContext<
  { state: DecisionState; change: (next: DecisionState) => void } | undefined
>(undefined);

/** Access the mounted decision and its local history writer. */
export function useDecision() {
  const value = useContext(DecisionContext);
  if (!value) throw new Error('Decision workspace missing');
  return value;
}
