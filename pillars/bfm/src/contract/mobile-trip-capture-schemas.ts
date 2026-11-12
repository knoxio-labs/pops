import { z } from 'zod';

import { MobileTripEventSchema } from './mobile-trips-event-schemas.js';
import { MobileJourneySchema } from './mobile-trips-journey-schemas.js';
import { MobileTripDateSchema, MobileTripSourceLinkSchema } from './mobile-trips-schemas.js';
import { MobileStaySchema } from './mobile-trips-stay-schemas.js';

const Id = z.number().int().positive();
const Text = z.string().refine((value) => value.trim().length > 0);
const TaskId = z.string().regex(/^[A-Za-z0-9_-]{1,72}$/u);
const Audit = {
  revision: z.number().int().positive(),
  removedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
/** Documents-issued identities only; a local file is not an accepted original. */
export const MobileCaptureAttachmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('task'), taskId: TaskId }),
  z.strictObject({ kind: z.literal('document'), documentId: Id, taskId: TaskId.optional() }),
]);
const Mutable = {
  title: Text.nullable(),
  notes: z.string(),
  classification: z.enum(['idea', 'note', 'event', 'link', 'document']).nullable(),
  placeId: Id.nullable(),
  visitId: Id.nullable(),
};
/** Mutable presentation never overwrites captured source material. */
export const MobileCapturePatchSchema = z.strictObject(Mutable).partial();
/** Canonical captured originals remain verbatim, with independently editable source facts. */
export const MobileTripCaptureSchema = z.object({
  id: Id,
  tripId: Id,
  originalText: z.string(),
  originalUrl: z.string().nullable(),
  attachments: z.array(MobileCaptureAttachmentSchema),
  ...Mutable,
  ...Audit,
});
const Input = z
  .strictObject({
    originalText: z.string(),
    originalUrl: z.string().nullable().optional(),
    attachments: z.array(MobileCaptureAttachmentSchema).optional(),
    ...MobileCapturePatchSchema.shape,
  })
  .refine(
    (input) =>
      input.originalText.trim().length > 0 ||
      (input.originalUrl?.trim().length ?? 0) > 0 ||
      (input.attachments?.length ?? 0) > 0
  );
/** Mobile creation captures sources only; classification never creates an organised booking or idea. */
export const MobileCaptureCreateSchema = z.strictObject({
  operationId: z.uuid(),
  command: z.strictObject({
    kind: z.literal('capture.create'),
    input: Input,
    explore: z.boolean().optional(),
  }),
});
/** Revision-checked canonical presentation edit, replayed by the original UUID. */
export const MobileCaptureUpdateSchema = z.strictObject({
  operationId: z.uuid(),
  command: z.strictObject({
    kind: z.literal('capture.update'),
    id: Id,
    expectedRevision: z.number().int().positive(),
    input: MobileCapturePatchSchema,
  }),
});
/** Append one Documents-issued identity with the producer's revision guard and replay UUID. */
export const MobileCaptureAttachSchema = z.strictObject({
  operationId: z.uuid(),
  command: z.strictObject({
    kind: z.literal('capture.attach'),
    id: Id,
    expectedRevision: z.number().int().positive(),
    attachment: MobileCaptureAttachmentSchema,
  }),
});
/** Explicit producer Undo, with its own replay identity and original target UUID. */
export const MobileCaptureUndoSchema = z.strictObject({
  operationId: z.uuid(),
  command: z.strictObject({ kind: z.literal('undo'), targetOperationId: z.uuid() }),
});
const Contact = MobileTripSourceLinkSchema.extend({
  uri: z.string().regex(/^pops:contacts\/contact\/[^/\s]+$/u),
});
const Source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('capture'), id: Id }),
  z.object({ kind: z.literal('idea'), id: Id }),
  z.object({ kind: z.literal('event'), id: Id }),
]);
const Target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idea'), id: Id }),
  z.object({ kind: z.literal('event'), id: Id }),
  z.object({ kind: z.literal('journey'), id: Id }),
  z.object({ kind: z.literal('stay'), id: Id }),
  z.object({ kind: z.literal('contact'), reference: Contact }),
]);
const IdeaTiming = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({
    mode: z.literal('month'),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
      .optional(),
  }),
  z.object({
    mode: z.literal('dates'),
    from: MobileTripDateSchema.optional(),
    to: MobileTripDateSchema.optional(),
  }),
]);
const Idea = z.object({
  id: Id,
  tripId: Id,
  name: Text.nullable(),
  kind: z.enum(['destination', 'place', 'activity']).nullable(),
  purpose: z.enum(['visit', 'meet-people', 'see-someone', 'other']).nullable(),
  status: z.enum(['Saved', 'Considering', 'In plan']).nullable(),
  reason: z.string(),
  notes: z.string(),
  address: z.string().nullable(),
  placeId: Id.nullable(),
  visitId: Id.nullable(),
  timing: IdeaTiming,
  sourceLinks: z.array(MobileTripSourceLinkSchema),
  contactLinks: z.array(Contact),
  recommendations: z.array(z.object({ contact: Contact, note: z.string() })),
  ...Audit,
});
/** Atomic producer snapshot, including tombstones needed for exact retry and Undo. */
export const MobileCaptureWorkspaceSchema = z.object({
  captures: z.array(MobileTripCaptureSchema),
  ideas: z.array(Idea),
  associations: z.array(
    z.object({
      id: Id,
      tripId: Id,
      captureId: Id,
      target: Target,
      provenance: z.enum(['existing', 'created']),
      sourceRevision: z.number().int().positive(),
      ...Audit,
    })
  ),
  memberships: z.array(z.object({ id: Id, tripId: Id, source: Source, ...Audit })),
  events: z.array(MobileTripEventSchema),
  journeys: z.array(MobileJourneySchema),
  stays: z.array(MobileStaySchema),
});
/** Original immutable receipt and current affected records are deliberately distinct on replay. */
export const MobileCaptureResultSchema = z.object({
  receipt: MobileCaptureWorkspaceSchema.extend({
    operationId: z.uuid(),
    undoneOperationId: z.uuid().nullable(),
  }),
  current: MobileCaptureWorkspaceSchema,
  undone: z.boolean(),
  replayed: z.boolean(),
});
/** Canonical mobile creation envelope. */
export type MobileCaptureCreate = z.infer<typeof MobileCaptureCreateSchema>;
/** Canonical mobile presentation edit envelope. */
export type MobileCaptureUpdate = z.infer<typeof MobileCaptureUpdateSchema>;
/** Canonical append-only attachment envelope, not a file upload. */
export type MobileCaptureAttach = z.infer<typeof MobileCaptureAttachSchema>;
/** Canonical mobile Undo envelope. */
export type MobileCaptureUndo = z.infer<typeof MobileCaptureUndoSchema>;
/** Atomic source workspace, without inferred route membership. */
export type MobileCaptureWorkspace = z.infer<typeof MobileCaptureWorkspaceSchema>;
/** Durable operation result, never a BFM-generated receipt. */
export type MobileCaptureResult = z.infer<typeof MobileCaptureResultSchema>;
