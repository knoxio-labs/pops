/** The partial-accept item creation surface used by the web bulk-entry grid. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';
import { SyncPlacementSchema } from './rest-sync-schemas.js';

const c = initContract();

/** The largest number of grid rows one web batch request may carry. */
export const WEB_BATCH_MAX_ROWS = 200;

/** The cells supported by the web bulk-entry and import grids. */
export const WEB_BATCH_COLUMNS = ['name', 'type', 'quantity', 'code', 'where', 'note'] as const;

/** A cell name in a web batch row. */
export type WebBatchColumn = (typeof WEB_BATCH_COLUMNS)[number];

/** One grid row; every cell is text and omitted cells are treated as empty. */
export const WebBatchRowSchema = z.object({
  name: z.string().default(''),
  type: z.string().default(''),
  quantity: z.string().default(''),
  code: z.string().default(''),
  where: z.string().default(''),
  note: z.string().default(''),
});

/** The request body for partial-accept web item creation. */
export const WebBatchBodySchema = z.object({
  rows: z.array(WebBatchRowSchema).min(1).max(WEB_BATCH_MAX_ROWS),
  /** Where a row with an empty `where` cell is placed; defaults to in hand. */
  destination: SyncPlacementSchema.default({ kind: 'hand' }),
  dryRun: z.boolean().default(false),
});

/** One validation problem attached to a row cell. */
export const WebBatchIssueSchema = z.object({
  column: z.enum(WEB_BATCH_COLUMNS),
  code: z.string(),
  message: z.string(),
});

/** The result for one submitted row. */
export const WebBatchOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('created'), row: z.number().int(), itemId: z.string() }),
  z.object({ status: z.literal('valid'), row: z.number().int() }),
  z.object({
    status: z.literal('invalid'),
    row: z.number().int(),
    issues: z.array(WebBatchIssueSchema).min(1),
  }),
  z.object({ status: z.literal('blank'), row: z.number().int() }),
]);

/** The row-ordered result of a web batch request. */
export const WebBatchResponseSchema = z.object({
  outcomes: z.array(WebBatchOutcomeSchema),
});

/** The inferred web batch request body. */
export type WebBatchBody = z.infer<typeof WebBatchBodySchema>;

/** The inferred web batch response body. */
export type WebBatchResponse = z.infer<typeof WebBatchResponseSchema>;

/** The inventory web batch REST router. */
export const inventoryWebBatchContract = c.router({
  create: {
    method: 'POST',
    path: '/web/items/batch',
    body: WebBatchBodySchema,
    responses: { 200: WebBatchResponseSchema, 400: ErrorBodySchema },
    summary: 'Partially create inventory items from typed web grid rows',
  },
});
