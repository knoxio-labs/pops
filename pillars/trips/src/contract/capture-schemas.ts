import { z } from 'zod';

const Id = z.number().int().positive();
const Text = z.string().refine((value) => value.trim().length > 0, 'Expected nonblank source text');
const TaskId = z.string().regex(/^[A-Za-z0-9_-]{1,72}$/u);

/** Accepted Documents owner identities only; browser files and file metadata are never originals. */
export const CaptureAttachmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('task'), taskId: TaskId }),
  z.strictObject({ kind: z.literal('document'), documentId: Id, taskId: TaskId.optional() }),
]);
/** Explicit approved capture classification; classification alone never organises a capture. */
export const CaptureClassificationSchema = z.enum(['idea', 'note', 'event', 'link', 'document']);
const MutableFields = {
  title: Text.nullable(),
  notes: z.string(),
  classification: CaptureClassificationSchema.nullable(),
  placeId: Id.nullable(),
  visitId: Id.nullable(),
};
/** Immutable verbatim source material with independently editable presentation and explicit references. */
export const CaptureSchema = z.object({
  id: Id,
  tripId: Id,
  originalText: z.string(),
  originalUrl: z.string().nullable(),
  attachments: z.array(CaptureAttachmentSchema),
  ...MutableFields,
  revision: z.number().int().positive(),
  removedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** Source capture preserves input bytes; at least text, URL or an accepted owner identity is required. */
export const CaptureInputSchema = z
  .strictObject({
    originalText: z.string(),
    originalUrl: z.string().nullable().optional(),
    attachments: z.array(CaptureAttachmentSchema).optional(),
    title: MutableFields.title.optional(),
    notes: MutableFields.notes.optional(),
    classification: MutableFields.classification.optional(),
    placeId: MutableFields.placeId.optional(),
    visitId: MutableFields.visitId.optional(),
  })
  .refine(
    (input) =>
      input.originalText.trim().length > 0 ||
      (input.originalUrl?.trim().length ?? 0) > 0 ||
      (input.attachments?.length ?? 0) > 0,
    'Capture source material is required'
  );
/** Mutable presentation fields never replace the original source or accepted attachment identities. */
export const CapturePatchSchema = z.strictObject(MutableFields).partial();
/** A trip-owned immutable source identity. */
export type TripCapture = z.infer<typeof CaptureSchema>;
/** A Documents original or accepted processing task, never a serialized browser File. */
export type CaptureAttachment = z.infer<typeof CaptureAttachmentSchema>;
/** Source capture input. */
export type CaptureInput = z.infer<typeof CaptureInputSchema>;
/** Editable capture fields. */
export type CapturePatch = z.infer<typeof CapturePatchSchema>;
