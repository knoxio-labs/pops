import { z } from 'zod';

const IdSchema = z.number().int().positive();
const TimestampSchema = z.iso.datetime();
const NameSchema = z.string().refine((value) => value.trim().length > 0, 'Name is required');

/** A real ISO calendar date, without a clock or viewer timezone. */
export const CalendarDateSchema = z.iso.date().refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Expected a valid calendar date');

/** Explicit external source or cross-pillar reference; linked records remain owned by their pillar. */
export const SourceLinkSchema = z.object({
  uri: z.union([
    z.url({ protocol: /^https?$/u }),
    z.string().regex(/^pops:[a-z][a-z0-9-]*\/[^/\s]+\/[^/\s]+$/u),
  ]),
  label: z.string().optional(),
});

/** Independent planning facts; durations need an explicit unit and at least one bound, while contradictory dates stay editable. */
export const VisitTimingSchema = z.object({
  arrival: CalendarDateSchema.optional(),
  departure: CalendarDateSchema.optional(),
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
    .refine(
      (value) => value.min !== undefined || value.max !== undefined,
      'Duration requires at least one bound'
    )
    .refine(
      (value) => value.min === undefined || value.max === undefined || value.max >= value.min,
      'Maximum duration must not precede minimum'
    )
    .optional(),
});

const SourceFields = {
  notes: z.string(),
  sourceLinks: z.array(SourceLinkSchema),
};
const AuditFields = { createdAt: TimestampSchema, updatedAt: TimestampSchema };

/** Trip-owned metadata; When stays opaque text and parent/tag references never supply route dates. */
export const TripSchema = z.object({
  id: IdSchema,
  name: NameSchema.nullable(),
  destination: z.string(),
  when: z.string(),
  tagId: z.string().uuid().nullable(),
  parentId: IdSchema.nullable(),
  ...SourceFields,
  ...AuditFields,
});

/** A reusable, manually entered place identity; it does not own contact addresses or provider data. */
export const PlaceSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  sourceLinks: z.array(SourceLinkSchema),
  ...AuditFields,
});

/** A distinct occurrence of a place in a trip, with route order separate from timing. */
export const VisitSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  placeId: IdSchema,
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  timing: VisitTimingSchema,
  ...SourceFields,
  ...AuditFields,
});

/** Optional source capture; empty destination/When clears text, null clears associations, and names stay nonblank or null. */
export const CreateTripBody = z.object({
  name: NameSchema.nullable().optional(),
  destination: z.string().optional(),
  when: z.string().optional(),
  tagId: z.string().uuid().nullable().optional(),
  parentId: IdSchema.nullable().optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
});

/** Mutable trip metadata; omitted fields retain their original values. */
export const UpdateTripBody = CreateTripBody;

/** Minimal manual place capture, reusable by multiple visits and trips. */
export const CreatePlaceBody = z.object({
  name: NameSchema,
  sourceLinks: z.array(SourceLinkSchema).optional(),
});

/** Mutable place fields; updates preserve its identity and existing visit references. */
export const UpdatePlaceBody = CreatePlaceBody.partial();

/** Explicit visit capture; new visits append to the route without deriving dates. */
export const CreateVisitBody = z.object({
  placeId: IdSchema,
  timing: VisitTimingSchema.optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
});

/** Mutable visit facts with an optional compatibility precondition; timing replaces the complete value. */
export const UpdateVisitBody = CreateVisitBody.partial().extend({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

/** The complete visit order for one trip, containing each existing visit exactly once. */
export const ReorderVisitsBody = z.object({ visitIds: z.array(IdSchema) });

/** Persisted trip source metadata. */
export type Trip = z.infer<typeof TripSchema>;
/** Persisted reusable place identity. */
export type Place = z.infer<typeof PlaceSchema>;
/** Persisted visit source facts. */
export type Visit = z.infer<typeof VisitSchema>;
/** Structured source timing, independent of route position. */
export type VisitTiming = z.infer<typeof VisitTimingSchema>;
/** Explicit source reference. */
export type SourceLink = z.infer<typeof SourceLinkSchema>;
/** Fields accepted for trip creation and metadata updates. */
export type TripInput = z.infer<typeof CreateTripBody>;
/** Fields accepted for place creation. */
export type PlaceInput = z.infer<typeof CreatePlaceBody>;
/** Fields accepted for place updates. */
export type PlaceUpdate = z.infer<typeof UpdatePlaceBody>;
/** Fields accepted for visit creation. */
export type VisitInput = z.infer<typeof CreateVisitBody>;
/** Fields accepted for visit updates. */
export type VisitUpdate = z.infer<typeof UpdateVisitBody>;
