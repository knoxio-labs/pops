import { createHash } from 'node:crypto';

import { EventSchema } from '../../contract/event-schemas.js';
import { JourneyLegSchema, JourneySchema } from '../../contract/journey-schemas.js';
import { MeetingPlanSchema } from '../../contract/meeting-plan-schemas.js';
import { RentalSchema } from '../../contract/rental-schemas.js';
import { VisitSchema } from '../../contract/schemas.js';
import { StaySchema } from '../../contract/stay-schemas.js';
import { canonicalSourceValue } from './source-canonical.js';
import { TripsServiceError } from './source-record.js';

import type { RouteDraftCandidate, RouteDraftSource } from '../../contract/route-draft-schemas.js';
import type {
  events,
  journeys,
  journeyLegs,
  meetingPlans,
  rentals,
  stays,
  visits,
} from '../schema.js';

/** Raw owned rows retain lifecycle facts omitted from ordinary live source DTOs. */
export type RouteDraftRecord =
  | { kind: 'visit'; row: typeof visits.$inferSelect }
  | { kind: 'journey'; row: typeof journeys.$inferSelect }
  | { kind: 'journey-leg'; row: typeof journeyLegs.$inferSelect }
  | { kind: 'stay'; row: typeof stays.$inferSelect }
  | { kind: 'event'; row: typeof events.$inferSelect }
  | { kind: 'rental'; row: typeof rentals.$inferSelect }
  | { kind: 'meeting'; row: typeof meetingPlans.$inferSelect };

/** Stable value guard; this is not an own-operation or Undo-lineage proof. */
export function routeDraftFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalSourceValue(value)).digest('hex');
}

/** Compare canonical identity namespaces, including a leg's owning Journey. */
export function routeDraftSourceKey(source: RouteDraftSource): string {
  return source.kind === 'journey-leg'
    ? `${source.kind}:${source.journeyId}:${source.id}`
    : `${source.kind}:${source.id}`;
}

/** Project identity without inferring any relation from display names or timing. */
export function routeDraftRecordSource(record: RouteDraftRecord): RouteDraftSource {
  return record.kind === 'journey-leg'
    ? { kind: record.kind, id: record.row.id, journeyId: record.row.journeyId }
    : { kind: record.kind, id: record.row.id };
}

/** Existing removed Meetings and legs do not become live confirmation evidence. */
export function routeDraftRecordRemoved(record: RouteDraftRecord): boolean {
  return record.kind === 'meeting' ? record.row.removed : record.row.removedAt !== null;
}

/** Read exactly the canonical independent confirmation axes, rejecting malformed stored source facts. */
export function routeDraftRecordFacts(record: RouteDraftRecord): {
  confirmed: boolean;
  facts: RouteDraftCandidate['facts'];
} {
  try {
    switch (record.kind) {
      case 'visit':
        VisitSchema.parse(record.row);
        return { confirmed: false, facts: [] };
      case 'journey':
        JourneySchema.parse(record.row);
        return { confirmed: false, facts: [] };
      case 'stay':
        return stayFacts(record);
      case 'rental':
        return rentalFacts(record);
      case 'meeting':
        return meetingFacts(record);
      case 'event':
        return eventFacts(record);
      case 'journey-leg':
        return journeyLegFacts(record);
    }
  } catch (error) {
    if (error instanceof TripsServiceError) throw error;
    throw new TripsServiceError('route_draft_conflict');
  }
}

function stayFacts(
  record: Extract<RouteDraftRecord, { kind: 'stay' }>
): ReturnType<typeof routeDraftRecordFacts> {
  const { status } = StaySchema.parse(record.row);
  return {
    confirmed: status === 'Agreed' || status === 'Reserved' || status === 'Purchased',
    facts: [{ field: 'status', value: status ?? null }],
  };
}

function rentalFacts(
  record: Extract<RouteDraftRecord, { kind: 'rental' }>
): ReturnType<typeof routeDraftRecordFacts> {
  const { status } = RentalSchema.parse(record.row);
  return {
    confirmed: status === 'Reserved' || status === 'Purchased',
    facts: [{ field: 'status', value: status ?? null }],
  };
}

function meetingFacts(
  record: Extract<RouteDraftRecord, { kind: 'meeting' }>
): ReturnType<typeof routeDraftRecordFacts> {
  const { agreement } = MeetingPlanSchema.parse(record.row);
  return { confirmed: agreement === 'Agreed', facts: [{ field: 'agreement', value: agreement }] };
}

function eventFacts(
  record: Extract<RouteDraftRecord, { kind: 'event' }>
): ReturnType<typeof routeDraftRecordFacts> {
  const value = EventSchema.parse(record.row);
  return arrangementFacts(value.arrangement, value.purchase);
}

function journeyLegFacts(
  record: Extract<RouteDraftRecord, { kind: 'journey-leg' }>
): ReturnType<typeof routeDraftRecordFacts> {
  const value = JourneyLegSchema.parse(record.row);
  return arrangementFacts(value.arrangement, value.purchase);
}

function arrangementFacts(
  arrangement: string | null | undefined,
  purchase: string | null | undefined
): ReturnType<typeof routeDraftRecordFacts> {
  return {
    confirmed: arrangement === 'Agreed' || arrangement === 'Booked' || purchase === 'Purchased',
    facts: [
      { field: 'arrangement', value: arrangement ?? null },
      { field: 'purchase', value: purchase ?? null },
    ],
  };
}
