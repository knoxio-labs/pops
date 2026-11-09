import { createContext, useContext } from 'react';

import type { TripDocumentsState } from './model';

/** Local original references and association changes shared across projections. */
export const TripDocumentsContext = createContext<
  | {
      state: TripDocumentsState;
      change: (next: TripDocumentsState) => void;
    }
  | undefined
>(undefined);

/** Access the local document ledger without a production client. */
export function useTripDocuments() {
  const context = useContext(TripDocumentsContext);
  if (!context) throw new Error('Document ledger missing');
  return context;
}
