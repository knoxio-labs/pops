import type { events } from './events.js';
import type { journeys, journeyLegs } from './journeys.js';
import type { meetingPlans } from './meeting-plans.js';
import type { visits } from './records.js';
import type { rentals } from './rentals.js';
import type { stays } from './stays.js';

/** Raw owned rows retain lifecycle facts omitted from ordinary live source DTOs. */
export type RouteDraftRecord =
  | { kind: 'visit'; row: typeof visits.$inferSelect }
  | { kind: 'journey'; row: typeof journeys.$inferSelect }
  | { kind: 'journey-leg'; row: typeof journeyLegs.$inferSelect }
  | { kind: 'stay'; row: typeof stays.$inferSelect }
  | { kind: 'event'; row: typeof events.$inferSelect }
  | { kind: 'rental'; row: typeof rentals.$inferSelect }
  | { kind: 'meeting'; row: typeof meetingPlans.$inferSelect };

/** One collection guard advances independently of retained Journey metadata. */
export interface RouteDraftCollectionInverse {
  journeyId: number;
  beforeRevision: number;
  expectedRevision: number;
  beforeLegIds: number[];
  afterLegIds: number[];
}

/** Mutable own-Undo guards accompany immutable public operation proof; originals are never deleted. */
export interface RouteDraftInverse {
  records: { before: RouteDraftRecord; after: RouteDraftRecord }[];
  collections: RouteDraftCollectionInverse[];
  referenceGuard: string;
}
