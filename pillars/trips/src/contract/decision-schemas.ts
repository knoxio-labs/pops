import { z } from 'zod';

import { CalendarDateSchema, SourceLinkSchema } from './schemas.js';

const Id = z.number().int().positive();
const Audit = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
/** Explicit source identity; references never transfer ownership or rewrite arrangements. */
export const DecisionSourceSchema = z.object({
  kind: z.enum(['visit', 'journey', 'stay']),
  id: Id,
});
/** Editable decision source fields; omission retains values and null clears the date-only deadline. */
export const DecisionInputSchema = z.object({
  question: z.string().optional(),
  deadline: CalendarDateSchema.nullable().optional(),
  notes: z.string().optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
});
/** Editable option facts; arrays replace complete values and unknown references remain identifiable. */
export const DecisionOptionInputSchema = z.object({
  title: z.string().optional(),
  notes: z.string().optional(),
  affectedSources: z
    .array(DecisionSourceSchema)
    .refine(
      (sources) =>
        new Set(sources.map((source) => `${source.kind}/${source.id}`)).size === sources.length,
      'Each source must appear once'
    )
    .optional(),
  sourceLinks: z.array(SourceLinkSchema).optional(),
});
/** Trip-owned decision; every successful mutation advances its aggregate revision by exactly one. */
export const DecisionSchema = z.object({
  id: Id,
  tripId: Id,
  question: z.string(),
  deadline: CalendarDateSchema.nullable(),
  notes: z.string(),
  sourceLinks: z.array(SourceLinkSchema),
  selectedOptionId: Id.nullable(),
  revision: z.number().int().nonnegative(),
  ...Audit,
});
/** Independent option source; removing a referenced arrangement does not erase its identity. */
export const DecisionOptionSchema = z.object({
  id: Id,
  decisionId: Id,
  title: z.string(),
  notes: z.string(),
  affectedSources: z.array(DecisionSourceSchema),
  sourceLinks: z.array(SourceLinkSchema),
  ...Audit,
});
/** Persisted decision source facts and selection. */
export type Decision = z.infer<typeof DecisionSchema>;
/** Persisted option facts and explicitly affected sources. */
export type DecisionOption = z.infer<typeof DecisionOptionSchema>;
/** Supplied decision fields. */
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
/** Supplied option fields. */
export type DecisionOptionInput = z.infer<typeof DecisionOptionInputSchema>;
/** Explicit source reference. */
export type DecisionSource = z.infer<typeof DecisionSourceSchema>;
