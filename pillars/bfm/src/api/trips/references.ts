import { validTripDocumentReferences } from './document-references.js';
import { uniqueTripsIds } from './wire.js';

import type { MobileTripDetail } from '../../contract/mobile-trips-detail-schemas.js';
import type { GatewayFailure } from '../pillars/gateway.js';

/** A source-contract fault, distinct from an outage and never an empty success. */
export function tripsContractMismatch(detail: string): GatewayFailure {
  return { kind: 'contract-mismatch', pillar: 'trips', status: 502, detail };
}
/** Every explicit place identity referenced by visits or source journey endpoints. */
export function referencedTripsPlaceIds(
  detail: Pick<MobileTripDetail, 'visits' | 'journeys'>
): Set<number> {
  const ids = new Set(detail.visits.map((visit) => visit.placeId));
  for (const journey of detail.journeys) {
    for (const leg of journey.legs) {
      if (leg.from.placeId !== undefined) ids.add(leg.from.placeId);
      if (leg.to.placeId !== undefined) ids.add(leg.to.placeId);
    }
  }
  return ids;
}
/** Reject mismatched ownership or unresolved required identities instead of substituting source labels. */
export function validTripsReferences(detail: MobileTripDetail, requestedId: number): boolean {
  if (detail.trip.id !== requestedId || !validTripDocumentReferences(detail)) return false;
  if (
    [
      ...detail.visits,
      ...detail.journeys,
      ...detail.stays,
      ...detail.events,
      ...detail.journeyGroups,
    ].some((record) => record.tripId !== requestedId)
  )
    return false;
  const visits = new Set(detail.visits.map((visit) => visit.id));
  const journeys = new Set(detail.journeys.map((journey) => journey.id));
  const places = new Set(detail.places.map((place) => place.id));
  if ([...referencedTripsPlaceIds(detail)].some((id) => !places.has(id))) return false;
  if (
    [...detail.stays, ...detail.events].some(
      (record) => record.visitId !== null && !visits.has(record.visitId)
    )
  )
    return false;
  if (detail.journeys.some((journey) => journey.legs.some((leg) => leg.journeyId !== journey.id)))
    return false;
  if (!uniqueTripsIds(detail.journeys.flatMap((journey) => journey.legs))) return false;
  return detail.journeyGroups.every((group) => {
    const members = [group.currentJourneyId, ...group.alternativeJourneyIds];
    return new Set(members).size === members.length && members.every((id) => journeys.has(id));
  });
}
