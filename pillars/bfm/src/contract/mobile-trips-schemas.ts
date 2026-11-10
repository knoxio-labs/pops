import { z } from 'zod';

/** Original Trips identities; IDs are never substituted by names or array positions. */
export const MobileTripIdSchema = z.number().int().positive();
/** A source calendar date, without an inferred clock or viewer zone. */
export const MobileTripDateSchema = z.iso.date().refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Expected a valid calendar date');
/** Source links remain opaque references; BFM does not manufacture cross-pillar relations. */
export const MobileTripSourceLinkSchema = z.object({
  uri: z.union([
    z.url({ protocol: /^https?$/u }),
    z.string().regex(/^pops:[a-z][a-z0-9-]*\/[^/\s]+\/[^/\s]+$/u),
  ]),
  label: z.string().optional(),
});
/** Supplied IANA zone identity, independent of a local endpoint clock. */
export const MobileTripTimeZoneSchema = z.string().refine((value) => {
  if (!value || /^[+-]/u.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}, 'Expected a supported IANA time zone');
/** Explicit minute-precision source clock, independent of dates and zone. */
export const MobileTripClockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
/** Source audit timestamps carry no trip completion or visit semantics. */
export const MobileTripAuditFields = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
/** Published Trips optional timing precision, retained independently of route order. */
export const MobileVisitTimingSchema = z.object({
  arrival: MobileTripDateSchema.optional(),
  departure: MobileTripDateSchema.optional(),
  month: z
    .object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      part: z.enum(['early', 'middle', 'late']).optional(),
    })
    .optional(),
  duration: z
    .object({
      min: z.number().nonnegative().optional(),
      max: z.number().nonnegative().optional(),
      unit: z.enum(['days', 'weeks']),
    })
    .refine((value) => value.min !== undefined || value.max !== undefined)
    .refine((value) => value.min === undefined || value.max === undefined || value.max >= value.min)
    .optional(),
});
/** Original trip metadata; When is opaque and nullable associations remain nullable. */
export const MobileTripSchema = z.object({
  id: MobileTripIdSchema,
  name: z
    .string()
    .refine((value) => value.trim().length > 0)
    .nullable(),
  destination: z.string(),
  when: z.string(),
  tagId: z.string().uuid().nullable(),
  parentId: MobileTripIdSchema.nullable(),
  notes: z.string(),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  ...MobileTripAuditFields,
});
/** Reusable source place identity; no contact address or provider data is inferred. */
export const MobileTripPlaceSchema = z.object({
  id: MobileTripIdSchema,
  name: z.string().refine((value) => value.trim().length > 0),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  ...MobileTripAuditFields,
});
/** A source visit occurrence, returned in the producer's independently stored order. */
export const MobileTripVisitSchema = z.object({
  id: MobileTripIdSchema,
  tripId: MobileTripIdSchema,
  placeId: MobileTripIdSchema,
  timing: MobileVisitTimingSchema,
  notes: z.string(),
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  ...MobileTripAuditFields,
});
/** Trip metadata exposed to native clients. */
export type MobileTrip = z.infer<typeof MobileTripSchema>;
/** Original place record. */
export type MobileTripPlace = z.infer<typeof MobileTripPlaceSchema>;
/** Original ordered visit record. */
export type MobileTripVisit = z.infer<typeof MobileTripVisitSchema>;
