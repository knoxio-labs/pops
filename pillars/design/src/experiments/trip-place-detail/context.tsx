import { createContext, useContext } from 'react';

import type { IdeaState } from './model';

/** One idea snapshot and undo history feed both presentations. */
export const IdeaContext = createContext<
  | {
      state: IdeaState;
      change: (next: IdeaState) => void;
    }
  | undefined
>(undefined);

/** Read explicit idea fields and source references from the mounted editor. */
export function useIdea() {
  const context = useContext(IdeaContext);
  if (!context) throw new Error('Idea workspace missing');
  return context;
}
