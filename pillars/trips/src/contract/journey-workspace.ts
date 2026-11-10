import { z } from 'zod';

import { JourneyLegSchema, JourneySchema } from './journey-schemas.js';
import { JourneyTimingSchema } from './journey-timing.js';

/** One atomic owning read: source metadata, ordered live legs and timing derived from those exact legs. */
export const JourneyWorkspaceSchema = z.object({
  journey: JourneySchema,
  legs: z.array(JourneyLegSchema),
  timing: JourneyTimingSchema,
});
/** Consistent journey source and timing snapshot, independent of calendar presentation or visit placement. */
export type JourneyWorkspace = z.infer<typeof JourneyWorkspaceSchema>;
