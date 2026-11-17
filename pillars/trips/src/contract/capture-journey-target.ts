import { z } from 'zod';

import { JourneyInputSchema, JourneyLegInputSchema } from './journey-schemas.js';
import { JourneyLegSetSchema } from './leg-removal-schemas.js';

/** Complete ordered leg proof for one explicitly created Journey; the revision is owned by that Journey. */
export const CaptureJourneyLegSetSchema = JourneyLegSetSchema.extend({
  journeyId: z.number().int().positive(),
});
/** Explicit metadata and optional ordered legs, created atomically without deriving route or booking facts. */
export const CaptureCreateJourneyTargetSchema = z.object({
  mode: z.literal('createJourney'),
  input: JourneyInputSchema,
  legs: z.array(JourneyLegInputSchema).optional(),
});
/** Immutable or current ordered leg-set proof, distinguished by the enclosing operation result. */
export type CaptureJourneyLegSet = z.infer<typeof CaptureJourneyLegSetSchema>;
