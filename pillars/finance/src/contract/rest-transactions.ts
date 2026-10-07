/**
 * `transactions.*` sub-router — transaction CRUD plus the delete/restore
 * (Undo) handshake.
 *
 * `restore` is `POST /transactions/restore` (a literal segment) so it does
 * not collide with the `:id` param routes.
 *
 * `list` and `get` are open to a guest (POPS-5866), who sees only
 * transactions on the accounts granted to them. `create`, `update`, `delete`
 * and `restore` are open to a guest holding `edit` on every account the write
 * touches (POPS-5867). `unlinkTransfer` and the two literal reads are not.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { guestRoute } from '@pops/pillar-sdk/server';

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
    metadata: guestRoute(),
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
    summary:
      'List transactions with optional filters and pagination. A guest is listed only ' +
      'transactions on accounts granted to them; an `accountId` they hold no grant on is a 404',
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
  get: {
    method: 'GET',
    path: '/transactions/:id',
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: TransactionSchema }), ...ERR_RESPONSES },
    summary:
      'Get a single transaction; 404s one on an account a guest holds no grant on, ' +
      'as it does a missing one',
  },
  create: {
    method: 'POST',
    path: '/transactions',
    metadata: guestRoute(),
    body: CreateTransactionBody,
    responses: {
      201: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Create a transaction. A guest needs `edit` on the account and may not set ' +
      '`relatedTransactionId`, `entityId`, `entityName`, `tags`, `rawRow` or `checksum`',
  },
  update: {
    method: 'PATCH',
    path: '/transactions/:id',
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    body: UpdateTransactionBody,
    responses: {
      200: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Update a transaction. A guest needs `edit` on its account, and on the new one when ' +
      '`accountId` changes, and may not set `relatedTransactionId`, `entityId`, `entityName` ' +
      'or `tags`',
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
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ message: z.string(), snapshot: TransactionSnapshotSchema }),
      ...ERR_RESPONSES,
    },
    summary:
      'Delete a transaction; returns a snapshot for Undo via restore. A guest needs `edit` ' +
      'on its account, and their snapshot carries no `rawRow` or `checksum`',
  },
  restore: {
    method: 'POST',
    path: '/transactions/restore',
    metadata: guestRoute(),
    body: TransactionSnapshotSchema,
    responses: {
      201: z.object({ data: TransactionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Restore a previously-deleted transaction from its snapshot. For a guest only the ' +
      "snapshot's `id` is read: the entry is rebuilt from its latest recorded delete, which " +
      'must be on an account they hold `edit` on, and is a 404 when there is none',
  },
});
