import type { ReactNode } from 'react';

import type { Client } from '../trips-api/client';
import type { ArrangementLabels } from './types';

/** Exact Trips transport and trip; the owning QueryClient defines the retained browser lifetime. */
export interface AccommodationGapIdentity {
  readonly tripId: number;
  readonly client?: Client;
}
/** Necessary host-translated coverage and conscious recovery controls, independent of other arrangement fields. */
export type AccommodationGapLabels = Pick<
  ArrangementLabels,
  | 'unknownCoverage'
  | 'accommodationMissing'
  | 'accommodationOverlap'
  | 'addStay'
  | 'creationUncertain'
  | 'beginNewStay'
  | 'reload'
>;
/** A Stay identity proved only by this intent's canonical create response; no route gap or path identity. */
export interface AccommodationGapStay {
  readonly tripId: number;
  readonly visitId: number;
  readonly stayId: number;
}
/** Keep this provider above conditional context views; replace its QueryClient when the actual host lifetime ends. */
export interface AccommodationGapProviderProps {
  readonly identity: AccommodationGapIdentity;
  readonly children: ReactNode;
}
/** An exact Visit context using complete source coverage, with a controlled canonical Stay editor callback. */
export interface AccommodationGapContextProps {
  readonly identity: AccommodationGapIdentity;
  readonly visitId: number;
  readonly labels: AccommodationGapLabels;
  readonly formatDate: (date: string) => string;
  /** Host must fence its selection generation so a late completion cannot replace a newer editor selection. */
  readonly onOpenStay: (source: AccommodationGapStay) => void;
}
