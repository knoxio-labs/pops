import { createContext, useContext } from 'react';

import type { SettingsState } from './model';

/** One editable snapshot and local save state feed both creation proposals. */
export const SettingsContext = createContext<
  { state: SettingsState; change: (next: SettingsState) => void } | undefined
>(undefined);

/** Read the settings workspace without reaching a product API. */
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('Trip settings workspace missing');
  return context;
}
