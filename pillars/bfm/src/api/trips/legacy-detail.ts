import type {
  MobileTripDetail,
  MobileTripDetailV2,
} from '../../contract/mobile-trips-detail-schemas.js';

/** Keeps the installed mobile detail wire unchanged by omitting only the versioned endpoint day; absent clocks stay absent. */
export function legacyTripDetail(source: MobileTripDetailV2): MobileTripDetail {
  return {
    ...source,
    journeys: source.journeys.map((journey) => ({
      ...journey,
      legs: journey.legs.map((leg) => ({
        ...leg,
        from: legacyEndpoint(leg.from),
        to: legacyEndpoint(leg.to),
      })),
    })),
  };
}

function legacyEndpoint(
  endpoint: MobileTripDetailV2['journeys'][number]['legs'][number]['from']
): MobileTripDetail['journeys'][number]['legs'][number]['from'] {
  const { date: _date, ...legacy } = endpoint;
  return legacy;
}
