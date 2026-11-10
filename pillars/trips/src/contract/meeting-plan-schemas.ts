import { z } from 'zod';

import { CalendarDateSchema } from './schemas.js';

const Id = z.number().int().positive().safe();
const Revision = z.number().int().positive().safe();
/** Contacts-issued identity namespace; the opaque final segment is never derived from display facts. */
export const MeetingContactUriSchema = z.string().regex(/^pops:contacts\/contact\/[^/?#\s]+$/u);
const Fields = {
  contactUri: MeetingContactUriSchema.nullable().optional(),
  visitId: Id.nullable().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  intention: z.enum(['Considering', 'Planned']).optional(),
  agreement: z.enum(['Not agreed', 'Agreed']).optional(),
  startDate: CalendarDateSchema.nullable().optional(),
  endDate: CalendarDateSchema.nullable().optional(),
};
/** Independently editable meeting facts; omission preserves values and null clears optional references/dates. */
export const MeetingPlanPatchSchema = z.object(Fields).strict();
/** Trip-owned source, including its removal marker; date contradictions remain source facts. */
export const MeetingPlanSchema = z.object({
  id: Id,
  tripId: Id,
  revision: Revision,
  removed: z.boolean(),
  contactUri: MeetingContactUriSchema.nullable(),
  visitId: Id.nullable(),
  title: z.string(),
  notes: z.string(),
  intention: z.enum(['Considering', 'Planned']),
  agreement: z.enum(['Not agreed', 'Agreed']),
  startDate: CalendarDateSchema.nullable(),
  endDate: CalendarDateSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** Idempotent source command; edits/removal use the exact confirmed revision, Undo names its own receipt. */
export const MeetingPlanOperationSchema = z
  .object({
    operationId: z.uuid(),
    command: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('create'),
          input: MeetingPlanPatchSchema.extend({ contactUri: MeetingContactUriSchema }),
        })
        .strict(),
      z
        .object({
          kind: z.literal('update'),
          id: Id,
          expectedRevision: Revision,
          patch: MeetingPlanPatchSchema,
        })
        .strict(),
      z.object({ kind: z.literal('remove'), id: Id, expectedRevision: Revision }).strict(),
      z.object({ kind: z.literal('undo'), targetOperationId: z.uuid() }).strict(),
    ]),
  })
  .strict();
/** Immutable historical outcome; later Undo never rewrites its source snapshots. */
export const MeetingPlanReceiptSchema = z.object({
  operationId: z.uuid(),
  undoneOperationId: z.uuid().nullable(),
  before: MeetingPlanSchema.nullable(),
  after: MeetingPlanSchema,
});
/** Retry response separates immutable outcome from the current source and Undo state. */
export const MeetingPlanOperationResultSchema = z.object({
  receipt: MeetingPlanReceiptSchema,
  current: MeetingPlanSchema,
  undone: z.boolean(),
  replayed: z.boolean(),
});
/** Persisted independent meeting-plan facts. */
export type MeetingPlan = z.infer<typeof MeetingPlanSchema>;
/** Partial editable source facts. */
export type MeetingPlanPatch = z.infer<typeof MeetingPlanPatchSchema>;
/** One replayable meeting-plan mutation. */
export type MeetingPlanOperation = z.infer<typeof MeetingPlanOperationSchema>;
/** Immutable mutation outcome. */
export type MeetingPlanReceipt = z.infer<typeof MeetingPlanReceiptSchema>;
/** Current source plus immutable operation outcome. */
export type MeetingPlanOperationResult = z.infer<typeof MeetingPlanOperationResultSchema>;
