import { createContext, useContext } from 'react';

import type { BusinessState } from './model';

/** Shares one fictional snapshot and undoable changes across the detail sections. */
export const BusinessContext = createContext<
  { state: BusinessState; change: (next: BusinessState) => void } | undefined
>(undefined);

/** Reads the active business prototype without a production client. */
export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('Business context missing');
  return context;
}
