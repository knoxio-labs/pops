import { createContext, useContext } from 'react';

import type { DirectoryState } from './model';

/** Share explicit filters, record identities and local changes between directory proposals. */
export const DirectoryContext = createContext<
  { state: DirectoryState; change: (state: DirectoryState) => void } | undefined
>(undefined);
/** Access the active local directory without a production client. */
export function useDirectory() {
  const value = useContext(DirectoryContext);
  if (!value) throw new Error('Directory missing');
  return value;
}
