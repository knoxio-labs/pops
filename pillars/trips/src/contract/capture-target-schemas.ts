import { z } from 'zod';

import { EventInputSchema } from './event-schemas.js';
import { IdeaContactLinkSchema, IdeaInputSchema } from './idea-schemas.js';
import { JourneyInputSchema, JourneyLegInputSchema } from './journey-schemas.js';
import { StayInputSchema } from './stay-schemas.js';

const Id = z.number().int().positive();

/** An explicit local target identity or a contact reference; display labels never resolve it. */
export const CaptureTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idea'), id: Id }),
  z.object({ kind: z.literal('event'), id: Id }),
  z.object({ kind: z.literal('journey'), id: Id }),
  z.object({ kind: z.literal('stay'), id: Id }),
  z.object({ kind: z.literal('contact'), reference: IdeaContactLinkSchema }),
]);

/** A selected capture destination, with optional reviewed legs when creating a Journey. */
export const CaptureOrganiseTargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), target: CaptureTargetSchema }),
  z.object({ mode: z.literal('createIdea'), input: IdeaInputSchema }),
  z.object({ mode: z.literal('createEvent'), input: EventInputSchema }),
  z.object({
    mode: z.literal('createJourney'),
    input: JourneyInputSchema,
    legs: z.array(JourneyLegInputSchema).optional(),
  }),
  z.object({ mode: z.literal('createStay'), input: StayInputSchema }),
]);
