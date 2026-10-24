import type { TripDate } from '@/fixtures/trip-overview-model';

/** Typed capture chooses a record type; the name is reusable source data. */
export type CaptureKind = 'city' | 'event' | 'idea' | 'stay' | 'transport' | 'rental' | 'section';
/** Creation context identifies route position, visit, or alternative section. */
export interface CaptureTarget {
  after?: string;
  visitId?: string;
  sectionId?: string;
  gapId?: string;
  start?: TripDate;
  end?: TripDate;
  stayId?: string;
}
