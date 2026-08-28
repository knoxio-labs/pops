/**
 * `transactions.*` sub-router — transaction CRUD plus the delete/restore
 * (Undo) handshake.
 *
 * `restore` is `POST /transactions/restore` (a literal segment) so it does
 * not collide with the `:id` param routes.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { SuggestedTagSchema } from './rest-imports-schemas.js';
import { ERR_RESPONSES } from './rest-schemas.js';
import {
  CreateTransactionBody,
  TransactionQuery,
  TransactionSchema,
  TransactionSnapshotSchema,
  UpdateTransactionBody,
} from './rest-transactions-schemas.js';

export { TransactionSchema, TransactionSnapshotSchema } from './rest-transactions-schemas.js';

const c = initContract();

export const financeTransactionsContract = c.router({
  list: {
    method: 'GET',
    path: '/transactions',
    query: TransactionQuery,
    responses: {
      200: z.object({
        data: z.array(TransactionSchema),
        pagination: z.object({
          total: z.number(),
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'List transactions with optional filters and pagination',
  },
  // Literal sub-paths declared BEFORE `:id` so they are never shadowed by the param route.
  suggestTags: {
    method: 'GET',
    path: '/transactions/suggest-tags',
    query: z.object({ description: z.string(), entityId: z.string().optional() }),
    // Full `SuggestedTag` objects, not bare strings: the import wizard
    // re-runs this after a manual entity assignment and has to render the
    // same 🏪/📋 provenance badges Tag Review shows for a matcher-resolved
    // row, which needs `source`/`pattern`/`isNew`.
    responses: { 200: z.object({ tags: z.array(SuggestedTagSchema) }) },
    summary: 'Rule-based tag suggestions for a description/entity (no LLM call)',
  },
  descriptionsForPreview: {
    method: 'GET',
    path: '/transactions/descriptions-preview',
    query: z.object({
      limit: z.coerce.number().int().positive().max(2000).optional(),
    }),
    responses: {
      200: z.object({
        data: z.array(z.object({ description: z.string(), checksum: z.string().nullable() })),
        total: z.number(),
        truncated: z.boolean(),
      }),
    },
    summary: 'Descriptions (+ checksums) of existing transactions for client-side rule preview',
  },
  availableTags: {
    method: 'GET',
    path: '/transactions/available-tags',
    responses: { 200: z.object({ tags: z.array(z.string()) }) },
    summary: 'Distinct tag values across all transactions (autocomplete)',
  },
  get: {
    method: 'GET',
    path: '/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: TransactionSchema }), ...ERR_RESPONSES },
    summary: 'Get a single transaction',
  },
  create: {
    method: 'POST',
    path: '/transactions',
    body: CreateTransactionBody,
    responses: {
      201: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Create a transaction',
  },
  update: {
    method: 'PATCH',
    path: '/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateTransactionBody,
    responses: {
      200: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Update a transaction',
  },
  unlinkTransfer: {
    method: 'POST',
    path: '/transactions/:id/unlink-transfer',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Break a false-positive transfer pair; symmetrically unlinks both legs',
  },
  delete: {
    method: 'DELETE',
    path: '/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ message: z.string(), snapshot: TransactionSnapshotSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'Delete a transaction; returns a snapshot for Undo via restore',
  },
  restore: {
    method: 'POST',
    path: '/transactions/restore',
    body: TransactionSnapshotSchema,
    responses: {
      201: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Restore a previously-deleted transaction from its snapshot',
  },
});
