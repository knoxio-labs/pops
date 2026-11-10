import { z } from 'zod';

import { MobileTripDocumentAssociationSchema } from '../../contract/mobile-trips-document-schemas.js';
import { MobileTripEventSchema } from '../../contract/mobile-trips-event-schemas.js';
import {
  MobileJourneyGroupSchema,
  MobileJourneyLegSchema,
  MobileJourneySchema,
} from '../../contract/mobile-trips-journey-schemas.js';
import {
  MobileTripPlaceSchema,
  MobileTripSchema,
  MobileTripVisitSchema,
} from '../../contract/mobile-trips-schemas.js';
import { MobileStaySchema } from '../../contract/mobile-trips-stay-schemas.js';

/** Producer collections must retain unique original identities, independently of equal names. */
export function uniqueTripsIds(rows: readonly { id: number }[]): boolean {
  return new Set(rows.map((row) => row.id)).size === rows.length;
}
/** Published Trips response envelopes, validated before any native payload is built. */
export const TripsWire = {
  trip: MobileTripSchema,
  trips: z.object({ trips: z.array(MobileTripSchema).refine(uniqueTripsIds) }),
  places: z.object({ places: z.array(MobileTripPlaceSchema).refine(uniqueTripsIds) }),
  visits: z.object({ visits: z.array(MobileTripVisitSchema).refine(uniqueTripsIds) }),
  journeys: z.object({ journeys: z.array(MobileJourneySchema).refine(uniqueTripsIds) }),
  legs: z.object({ legs: z.array(MobileJourneyLegSchema).refine(uniqueTripsIds) }),
  groups: z.object({ groups: z.array(MobileJourneyGroupSchema).refine(uniqueTripsIds) }),
  stays: z.object({ stays: z.array(MobileStaySchema).refine(uniqueTripsIds) }),
  associations: z.object({
    associations: z.array(MobileTripDocumentAssociationSchema).refine(uniqueTripsIds),
  }),
  events: z.object({ events: z.array(MobileTripEventSchema).refine(uniqueTripsIds) }),
};
