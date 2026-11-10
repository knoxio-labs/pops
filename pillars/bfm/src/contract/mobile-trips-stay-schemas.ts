import { z } from 'zod';

import {
  MobileTripAuditFields,
  MobileTripClockSchema,
  MobileTripDateSchema,
  MobileTripIdSchema,
  MobileTripSourceLinkSchema,
  MobileTripTimeZoneSchema,
} from './mobile-trips-schemas.js';

/** Original date-only stay bounds and optional source clocks, with checkout-exclusive departure. */
export const MobileStayTimingSchema = z.object({
  arrival: MobileTripDateSchema.optional(),
  departure: MobileTripDateSchema.optional(),
  checkIn: MobileTripClockSchema.optional(),
  checkOut: MobileTripClockSchema.optional(),
  timeZone: MobileTripTimeZoneSchema.optional(),
});
/** Independent stay source facts; host/document links stay opaque rather than becoming new relations. */
export const MobileStaySchema = z.object({
  id: MobileTripIdSchema,
  tripId: MobileTripIdSchema,
  visitId: MobileTripIdSchema.nullable(),
  name: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  kind: z.enum(['hotel', 'friend', 'family', 'other']).nullable(),
  status: z.enum(['Considering', 'Agreed', 'Reserved', 'Purchased']).nullable(),
  timing: MobileStayTimingSchema,
  address: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string(),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  hostLinks: z.array(MobileTripSourceLinkSchema),
  documentLinks: z.array(MobileTripSourceLinkSchema),
  ...MobileTripAuditFields,
});
/** Original stay record, without inferred booking or responsibility fields. */
export type MobileStay = z.infer<typeof MobileStaySchema>;
