import { createContext, useContext } from 'react';

import type { VisitDraft, VisitEditorState } from './model';

/** Shared visit source state and editor actions for both save behaviours. */
export const VisitEditorContext = createContext<
  | {
      state: VisitEditorState;
      update: (draft: VisitDraft) => void;
      addPlace: (name: string) => void;
      mode: 'direct' | 'draft';
    }
  | undefined
>(undefined);

/** Read the active visit editor without importing a production client or contract. */
export function useVisitEditor() {
  const value = useContext(VisitEditorContext);
  if (!value) throw new Error('Visit editor workspace missing');
  return value;
}
