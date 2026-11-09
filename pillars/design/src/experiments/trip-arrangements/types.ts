import type { TripDate, TripRecord } from '../../fixtures/trip-overview-model';
import type { CalendarBooking } from '../trip-route-editing/calendar-types';
import type { CanvasState, RentalPeriod } from '../trip-route-editing/canvas-model';

/** Explicit fictional policy facts; an absent cost or deadline remains unknown. */
export interface ArrangementPolicy {
  recordId: string;
  source: string;
  notes: string;
  /** Source amount in major currency units; no conversion or default currency is applied. */
  changeCost?: { amount: number; currency: string };
  cancellation?: { at: string; timeZone: string };
}

/** Source route, policy evidence and a fixed explicit reference clock for deadline comparison. */
export interface ArrangementState {
  canvas: CanvasState;
  policies: ArrangementPolicy[];
  referenceAt: string;
  contacts: ArrangementContact[];
  responsibilities: { recordId: string; contactId: string }[];
}

/** Explicit fictional contact identities; self is a captured fact rather than a name convention. */
export interface ArrangementContact {
  id: string;
  name: string;
  self: boolean;
}

/** An optional association retaining an unresolved contact identifier without inventing an owner. */
export interface ArrangementResponsible {
  contactId: string;
  label: string;
  self?: boolean;
  available: boolean;
}

/** A source-preserving ledger row; an event does not imply that a ticket or payment is required. */
export interface ArrangementRow {
  id: string;
  kind: 'transport' | 'stay' | 'event' | 'rental';
  name: string;
  visitId: string;
  visitName: string;
  status: string;
  intention: string;
  purchased: boolean;
  bookings: CalendarBooking[];
  source: { kind: 'record'; record: TripRecord } | { kind: 'rental'; rental: RentalPeriod };
  policy?: ArrangementPolicy;
  responsible?: ArrangementResponsible;
}

/** Independent source text, kind and explicit purchase-flag filters. */
export interface ArrangementFilters {
  query: string;
  kind: string;
  purchase: 'all' | 'purchased' | 'not-purchased';
}

/** Named fictional source scenarios for ledger review. */
export type ArrangementScenario =
  | 'default'
  | 'empty'
  | 'unknown-dates'
  | 'missing-reference'
  | 'invalid-policy';

/** Explicit missing route logistics; record identifiers resolve to actual source visits. */
export interface ArrangementCoverage {
  id: string;
  kind: 'transport' | 'stay';
  recordIds: string[];
  title: string;
  detail: string;
  /** Validated half-open lodging bounds; no dates are supplied for transport gaps. */
  start?: TripDate;
  end?: TripDate;
}
