import { accommodationPeriods, validDate } from './periods';

import type { AccommodationPeriod, AccommodationProjection } from './periods';
import type { Stay, TripEvent, Visit } from './types';

const STAY_COVERS_NIGHTS: Record<NonNullable<Stay['status']>, boolean> = {
  Considering: false,
  Agreed: true,
  Reserved: true,
  Purchased: true,
};

/** Proven checkout-exclusive coverage, or explicit uncertainty without invented missing nights. */
export type AccommodationCoverage =
  | { state: 'unknown' }
  | { state: 'covered' | 'missing'; arrival: string; departure: string; stays: Stay[] };

/** Original source period retains all ideas and activities; coverage describes only its bounded Visit intersection. */
export interface AccommodationCoveragePeriod extends AccommodationPeriod {
  coverage: AccommodationCoverage;
}

/** Source-preserving period projection with explicit coverage certainty independent of purchase styling. */
export interface AccommodationCoverageProjection extends AccommodationProjection {
  periods: AccommodationCoveragePeriod[];
  coverageKnown: boolean;
}

/** User-confirmed source-state policy: Agreed, Reserved and Purchased cover nights; Considering and unset do not. */
export function stayProvidesCoverage(stay: Pick<Stay, 'status'>): boolean {
  return stay.status !== null && STAY_COVERS_NIGHTS[stay.status];
}

/**
 * Classify existing source periods without changing memberships. Valid arranged Stays prove
 * coverage independently of incomplete neighbours. Considering never masks a gap; uncertain
 * arranged or unset sources prevent missing-night claims only where they could overlap.
 * Covered/missing bounds are clipped to the actual bounded Visit; checkout stays exclusive.
 */
export function accommodationCoverage(
  visit: Visit,
  candidates: Stay[],
  activities: TripEvent[],
  accommodationComplete = true
): AccommodationCoverageProjection {
  const projection = accommodationPeriods(visit, candidates, activities, {
    accommodationComplete,
    includeUnknownVisitPeriods: true,
  });
  const unplaced = new Set(projection.unplacedStays);
  const uncertain = candidates.filter(
    (stay) =>
      stay.visitId === visit.id &&
      stay.status !== 'Considering' &&
      (stay.status === null || unplaced.has(stay))
  );
  const bounds = visitBounds(visit);
  const periods = projection.periods.map((period) => ({
    ...period,
    coverage: periodCoverage(period, bounds, uncertain, accommodationComplete),
  }));
  return {
    ...projection,
    periods,
    coverageKnown:
      bounds !== undefined &&
      periods.every(
        (period) => !intersectsVisit(period, bounds) || period.coverage.state !== 'unknown'
      ),
  };
}

type Bounds = { arrival: string; departure: string };
function visitBounds(visit: Visit): Bounds | undefined {
  const { arrival, departure } = visit.timing;
  return validDate(arrival) && validDate(departure) && departure > arrival
    ? { arrival, departure }
    : undefined;
}
function intersectsVisit(period: AccommodationPeriod, bounds: Bounds): boolean {
  return period.arrival < bounds.departure && period.departure > bounds.arrival;
}
function periodCoverage(
  period: AccommodationPeriod,
  bounds: Bounds | undefined,
  uncertain: Stay[],
  complete: boolean
): AccommodationCoverage {
  if (!bounds || !intersectsVisit(period, bounds)) return { state: 'unknown' };
  const arrival = period.arrival > bounds.arrival ? period.arrival : bounds.arrival;
  const departure = period.departure < bounds.departure ? period.departure : bounds.departure;
  const stays = period.stays.filter(stayProvidesCoverage);
  if (stays.length > 0) return { state: 'covered', arrival, departure, stays };
  if (!complete || uncertain.some((stay) => couldIntersect(stay, arrival, departure)))
    return { state: 'unknown' };
  return { state: 'missing', arrival, departure, stays };
}
function couldIntersect(stay: Stay, arrival: string, departure: string): boolean {
  const start = validDate(stay.timing.arrival) ? stay.timing.arrival : undefined;
  const end = validDate(stay.timing.departure) ? stay.timing.departure : undefined;
  if (start && end && end <= start) return true;
  return (!start || start < departure) && (!end || end > arrival);
}
