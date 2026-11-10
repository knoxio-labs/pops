import type { Client } from '../trips-api/client';
import type { ArrangementLabels, ArrangementSources, Rental } from './types';

/** Translated canonical Rental fields and source diagnostics, without navigation or unrelated source controls. */
export type RentalLabels = Pick<
  ArrangementLabels,
  | 'loading'
  | 'rental'
  | 'provider'
  | 'pickup'
  | 'return'
  | 'start'
  | 'end'
  | 'status'
  | 'save'
  | 'undo'
  | 'reload'
  | 'sourceChanged'
  | 'unset'
  | 'visit'
  | 'visitUnavailable'
  | 'placeUnavailable'
  | 'referenceDetails'
> & {
  sourceStates: Pick<ArrangementLabels['sourceStates'], 'Considering' | 'Reserved' | 'Purchased'>;
};
/** The exact owning transport and translated fields for a contextual canonical Rental editor. */
export interface RentalContext {
  tripId: number;
  client?: Client;
  labels: RentalLabels;
}
/** Existing ordered Visit identities and global Place display facts; no endpoint inference is performed. */
export type RentalSourceContext = Pick<ArrangementSources, 'visits' | 'places'>;
/** Render the existing editor for one actual Rental; drafts live for the host QueryClient's lifetime. */
export interface RentalContextEditorProps {
  identity: RentalContext;
  id: number;
  sources: RentalSourceContext;
  /** Deliver only a known own PATCH response while its initiating view remains current. */
  saved?: (rental: Rental) => void;
}
