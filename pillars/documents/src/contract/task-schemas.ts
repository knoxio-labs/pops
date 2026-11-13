import { z } from 'zod';

/** A Paperless task ID, independent of the caller-selected upload operation UUID. */
export const PaperlessTaskIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,72}$/);

/** Actual upstream consumption state; only done/duplicate with a positive ID proves an original. */
export const PaperlessTaskStatusSchema = z.object({
  state: z.enum(['pending', 'done', 'duplicate', 'failed']),
  documentId: z.number().int().positive().nullable(),
  reason: z.string().nullable(),
});
