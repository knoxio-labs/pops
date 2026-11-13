import type { TripDate } from './trip-overview-model';

/** Explicit fictional source state; only Purchased receives firm visual emphasis. */
export type CraftArrangementState = 'Purchased' | 'Reserved' | 'Agreed' | 'Considering' | null;

/** A source endpoint can have a date without a clock, or no supplied date at all. */
export interface CraftEndpoint {
  placeId: string;
  date?: TripDate;
  localTime?: string;
  timeZone?: string;
}

/** One fictional journey, with independently supplied departure and arrival fields. */
export interface CraftFlight {
  kind: 'flight';
  id: string;
  departure: CraftEndpoint;
  arrival: CraftEndpoint;
  state: CraftArrangementState;
  carrier?: string;
  service?: string;
  handledBy?: string;
  notes?: string;
}

/** Accommodation spans are checkout-exclusive; candidate ideas do not cover the gap. */
export interface CraftStay {
  kind: 'stay';
  id: string;
  title: string;
  checkIn: TripDate;
  checkOut: TripDate;
  state: CraftArrangementState;
  handledBy?: string;
  notes?: string;
}

/** Activity dates and optional clocks are supplied independently of the Visit's bounds. */
export interface CraftActivity {
  kind: 'activity';
  icon: 'music' | 'activity';
  id: string;
  title: string;
  date: TripDate;
  localTime?: string;
  timeZone?: string;
  state: CraftArrangementState;
  notes?: string;
}

/** A fixture gap is a proven uncovered interval, distinct from a persisted route gap. */
export interface CraftAccommodationGap {
  kind: 'accommodation-gap';
  id: string;
  start: TripDate;
  end: TripDate;
}

/** A captured thought stays in its explicit Visit, with no inferred date or booking state. */
export interface CraftThought {
  kind: 'thought';
  id: string;
  title: string;
}

/** Typed fictional content of one Visit occurrence. */
export type CraftVisitItem = CraftStay | CraftActivity | CraftAccommodationGap | CraftThought;

/** Flat Visit occurrence with explicit source bounds and supplied coverage state. */
export interface CraftVisit {
  kind: 'visit';
  id: string;
  placeId: string;
  arrival?: TripDate;
  departure?: TripDate;
  notes?: string;
  coverage: 'known' | 'unknown';
  items: readonly CraftVisitItem[];
}

/** One explicitly ordered fixture Timeline, with no date-based placement inference. */
export interface CraftTimeline {
  title: string;
  subtitle: string;
  rows: readonly (CraftVisit | CraftFlight)[];
  documents: readonly { id: string; title: string; source: string }[];
}

/** Fictional Finance record facts are display-only; membership comes from the explicit trip tag. */
export interface CraftSpendingRecord {
  readonly id: string;
  readonly merchant: string;
  readonly date: string;
  readonly account: string;
  readonly amount: string;
  readonly unit: string;
  readonly type: string;
}

/** Read and owner-recovery states shown inline without making Finance writes in Trips. */
export type CraftSpendingState =
  | { kind: 'tag-missing' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'partial'; tagLabel: string; records: readonly CraftSpendingRecord[] }
  | { kind: 'ready'; tagLabel: string; records: readonly CraftSpendingRecord[] }
  | { kind: 'creating'; tagLabel: string }
  | { kind: 'attachment-failed'; tagLabel: string; transaction: CraftSpendingRecord }
  | { kind: 'uncertain-create'; tagLabel: string }
  | { kind: 'choose-existing'; tagLabel: string; records: readonly CraftSpendingRecord[] }
  | { kind: 'linked'; tagLabel: string; transaction: CraftSpendingRecord };

/** Typed UI intents let the Finance owner retain create, retry, and recovery authority. */
export type CraftFinanceIntent =
  | { kind: 'choose-trip-tag' }
  | { kind: 'refresh-spending' }
  | { kind: 'open-manual-entry' }
  | { kind: 'open-transaction'; transactionId: string }
  | { kind: 'retry-trip-link'; transactionId: string }
  | { kind: 'find-existing-transaction' }
  | { kind: 'link-existing-transaction'; transactionId: string };
