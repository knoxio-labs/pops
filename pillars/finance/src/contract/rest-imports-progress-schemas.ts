/**
 * Zod schemas for the import session's progress poll (`GET /imports/progress`)
 * and the session handle it is keyed on. Split from `rest-imports-schemas.ts`
 * so that file stays under the per-file line cap; nothing here is imported by
 * the pipeline, only by the route map.
 */
import { z } from 'zod';

import { ProcessImportOutputSchema } from './rest-imports-schemas.js';

export const SessionIdSchema = z.object({ sessionId: z.string() });

const ProgressBatchItemSchema = z.object({
  description: z.string(),
  status: z.enum(['processing', 'success', 'failed']),
  error: z.string().optional(),
});

export const ImportProgressSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['processing', 'completed', 'failed']),
  currentStep: z.enum(['deduplicating', 'matching', 'categorizing']),
  totalTransactions: z.number(),
  processedCount: z.number(),
  currentBatch: z.array(ProgressBatchItemSchema),
  errors: z.array(z.object({ description: z.string(), error: z.string() })),
  startedAt: z.string(),
  result: ProcessImportOutputSchema.optional(),
});
