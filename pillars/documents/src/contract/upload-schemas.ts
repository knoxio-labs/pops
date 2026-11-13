import { z } from 'zod';

import { PaperlessTaskIdSchema } from './task-schemas.js';

/** Immutable identity of one durable upload; a filename is metadata, never a server path. */
export const UploadInputSchema = z.strictObject({
  operationId: z.uuid(),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\\p{Cc}]+$/u)
    .refine((name) => name !== '.' && name !== '..'),
  title: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^\p{Cc}]+$/u)
    .optional(),
  mimeType: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

/** Caller-selected durable operation identity; Paperless creates its own independent task ID. */
export const UploadParamsSchema = z.strictObject({ operationId: z.uuid() });

const shared = {
  input: UploadInputSchema,
  ownerMatches: z.boolean(),
};
const unsent = { ...shared, taskId: z.null(), documentId: z.null(), reason: z.null() };
const finished = {
  ...shared,
  taskId: PaperlessTaskIdSchema,
  documentId: z.number().int().positive(),
  reason: z.string().nullable(),
  contentAvailable: z.boolean(),
};

/** Durable proof only: task/original identities exist only in states supported by actual owner evidence. */
export const UploadRecordSchema = z.discriminatedUnion('state', [
  z.strictObject({
    ...unsent,
    state: z.literal('awaiting_content'),
    contentAvailable: z.literal(false),
  }),
  z.strictObject({ ...unsent, state: z.literal('admitted'), contentAvailable: z.literal(true) }),
  z.strictObject({
    ...unsent,
    state: z.literal('outcome_unknown'),
    contentAvailable: z.boolean(),
    blockedBy: z.enum(['dispatch_unproven', 'restored_history', 'guard_unavailable']),
  }),
  z.strictObject({
    ...shared,
    state: z.literal('accepted'),
    taskId: PaperlessTaskIdSchema,
    documentId: z.null(),
    reason: z.null(),
    contentAvailable: z.literal(true),
  }),
  z.strictObject({ ...finished, state: z.literal('done') }),
  z.strictObject({ ...finished, state: z.literal('duplicate') }),
  z.strictObject({
    ...shared,
    state: z.literal('failed'),
    taskId: PaperlessTaskIdSchema,
    documentId: z.null(),
    reason: z.string().nullable(),
    contentAvailable: z.literal(true),
  }),
]);

/** One operation's immutable input, shared by JSON admission and raw-byte validation. */
export type UploadInput = z.infer<typeof UploadInputSchema>;

/** Recoverable upload proof independent of transient HTTP responses and upstream task retention. */
export type UploadRecord = z.infer<typeof UploadRecordSchema>;
