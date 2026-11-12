import { z } from 'zod';

import { MobileTripDocumentAssociationSchema } from './mobile-trips-document-schemas.js';
import { MobileTripEventSchema } from './mobile-trips-event-schemas.js';
import {
  MobileJourneyGroupSchema,
  MobileJourneyLegSchema,
  MobileJourneyLegV2Schema,
  MobileJourneySchema,
} from './mobile-trips-journey-schemas.js';
import {
  MobileTripPlaceSchema,
  MobileTripSchema,
  MobileTripVisitSchema,
} from './mobile-trips-schemas.js';
import { MobileStaySchema } from './mobile-trips-stay-schemas.js';
import { MobilePageLimit } from './rest-mobile-responses.js';

/** A complete original journey with all legs in the producer's explicit stored order. */
export const MobileJourneyDetailSchema = MobileJourneySchema.extend({
  legs: z.array(MobileJourneyLegSchema),
});
/** A complete trip read; failures never masquerade as successfully loaded empty collections. */
export const MobileTripDetailSchema = z.object({
  trip: MobileTripSchema,
  places: z.array(MobileTripPlaceSchema),
  visits: z.array(MobileTripVisitSchema),
  journeys: z.array(MobileJourneyDetailSchema),
  journeyGroups: z.array(MobileJourneyGroupSchema),
  stays: z.array(MobileStaySchema),
  events: z.array(MobileTripEventSchema),
  documentAssociations: z.array(MobileTripDocumentAssociationSchema),
});
/** Explicit v2 detail retains source days without changing responses consumed by installed legacy clients. */
export const MobileTripDetailV2Schema = MobileTripDetailSchema.extend({
  journeys: z.array(MobileJourneyDetailSchema.extend({ legs: z.array(MobileJourneyLegV2Schema) })),
});
/** Snapshot-bound cursor page, with the exact total count of source trips. */
export const MobileTripsPageSchema = z.object({
  items: z.array(MobileTripSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
});
/** Published default page size; the shared mobile contract supplies the maximum, not the native UI. */
export const MobileTripsQuerySchema = z.object({
  limit: MobilePageLimit.default(25),
  cursor: z.string().min(1).optional(),
});
/** Complete native trip read payload. */
export type MobileTripDetail = z.infer<typeof MobileTripDetailSchema>;
/** Day-aware detail returned only by the explicitly versioned mobile operation. */
export type MobileTripDetailV2 = z.infer<typeof MobileTripDetailV2Schema>;
/** One mobile trip-list page. */
export type MobileTripsPage = z.infer<typeof MobileTripsPageSchema>;
/** Validated mobile trip-list input. */
export type MobileTripsQuery = z.infer<typeof MobileTripsQuerySchema>;
