import { createContext, useContext } from 'react';

import type { TripPeopleState } from './model';

/** Shares trip meeting changes without mutating the contact catalogue. */
export const TripPeopleContext = createContext<
  { state: TripPeopleState; change: (next: TripPeopleState) => void } | undefined
>(undefined);

/** Reads the active fictional trip people and local meeting actions. */
export function useTripPeople() {
  const context = useContext(TripPeopleContext);
  if (!context) throw new Error('Trip people context missing');
  return context;
}
