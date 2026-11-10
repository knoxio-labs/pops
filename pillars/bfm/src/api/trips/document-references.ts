import type { MobileTripDetail } from '../../contract/mobile-trips-detail-schemas.js';
import type { MobileTripDocumentAssociation } from '../../contract/mobile-trips-document-schemas.js';

/** Validates only Trips-owned targets; Documents original availability is a separate authorized read. */
export function validTripDocumentReferences(detail: MobileTripDetail): boolean {
  const targetIds: Record<MobileTripDocumentAssociation['targetKind'], ReadonlySet<number>> = {
    trip: new Set([detail.trip.id]),
    visit: new Set(detail.visits.map((record) => record.id)),
    journey: new Set(detail.journeys.map((record) => record.id)),
    stay: new Set(detail.stays.map((record) => record.id)),
    event: new Set(detail.events.map((record) => record.id)),
  };
  return detail.documentAssociations.every(
    (association) =>
      association.tripId === detail.trip.id &&
      targetIds[association.targetKind].has(association.targetId)
  );
}
