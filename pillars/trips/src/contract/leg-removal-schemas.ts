import { z } from 'zod';

import { JourneyLegSchema } from './journey-schemas.js';

/** Each first successful leg mutation advances the collection by exactly one; idempotent replays do not. JSON/JavaScript safe-integer exhaustion rejects new writes atomically. */
export const LegRevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** Existing source writers may omit the guard; source-backed editors always supply it. */
export const LegWritePreconditionSchema = z.object({
  expectedRevision: LegRevisionSchema.optional(),
});
/** One stable client intent, reused unchanged when a removal response is lost. */
export const LegRemovalInputSchema = z.object({
  operationId: z.uuid(),
  expectedRevision: LegRevisionSchema,
});
/** Persistent removal lifecycle; its revisions identify owned outcomes without lending a later writer's revision. */
export const LegRemovalReceiptSchema = z.object({
  operationId: z.uuid(),
  legId: z.number().int().positive(),
  state: z.enum(['removed', 'restored']),
  removedRevision: LegRevisionSchema,
  restoredRevision: LegRevisionSchema.nullable(),
});
/** Coherent live collection snapshot; visibility and ordering share this revision. */
export const JourneyLegSetSchema = z.object({
  revision: LegRevisionSchema,
  legs: z.array(JourneyLegSchema),
});
/** Replays return the current snapshot and the persisted receipt without applying an old lifecycle again. */
export const LegRemovalResultSchema = JourneyLegSetSchema.extend({
  receipt: LegRemovalReceiptSchema,
});
/** Public lifecycle receipt without archived source fields or persistence metadata. */
export type LegRemovalReceipt = z.infer<typeof LegRemovalReceiptSchema>;
/** Atomic collection result of an initial operation or its idempotent replay. */
export type LegRemovalResult = z.infer<typeof LegRemovalResultSchema>;
/** Optional source write precondition retained for legacy callers. */
export type LegWritePrecondition = z.infer<typeof LegWritePreconditionSchema>;
