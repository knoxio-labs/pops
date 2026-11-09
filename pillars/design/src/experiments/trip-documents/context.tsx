import { createContext, useContext, useMemo, useState } from 'react';

import type { ReactNode } from 'react';

import type { TripDocumentsState } from './model';

/** Local references and source selection; selection stays outside the association Undo history. */
export const TripDocumentsContext = createContext<
  | {
      state: TripDocumentsState;
      change: (next: TripDocumentsState) => void;
      selectedId: string | null;
      select: (id: string | null) => void;
    }
  | undefined
>(undefined);

/** Keep one source selection alive independently of grouped row and filter lifetimes. */
export function TripDocumentsProvider({
  state,
  change,
  children,
}: {
  state: TripDocumentsState;
  change: (next: TripDocumentsState) => void;
  children: ReactNode;
}) {
  const [selectedId, select] = useState<string | null>(null);
  const value = useMemo(() => ({ state, change, selectedId, select }), [state, change, selectedId]);
  return <TripDocumentsContext value={value}>{children}</TripDocumentsContext>;
}

/** Access the local document ledger without a production client. */
export function useTripDocuments() {
  const context = useContext(TripDocumentsContext);
  if (!context) throw new Error('Document ledger missing');
  return context;
}
