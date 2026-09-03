/**
 * `accounts.*` sub-router — full account CRUD (POPS-2767).
 *
 * `transactions.account_id` foreign-keys onto this table; the free-text
 * `transactions.account` column stays until POPS-2770. `institutionId` and
 * `currency` are nullable/required FKs onto `institutions` (POPS-2803) and
 * `currencies` (POPS-2802) respectively — `institutionId` is null for `cash`
 * and `person` accounts, which have no issuing institution.
 *
 * `delete` archives rather than hard-deletes (`archivedAt`): an account is
 * referenced by every transaction it ever carried, so removing the row would
 * either cascade-delete history or dangle a foreign key. Archiving is
 * reversible through `update` by patching `archivedAt` back to `null`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ACCOUNT_KINDS } from './account-kind.js';
import { ERR_RESPONSES, ERR_RESPONSES_WITH_422, LimitQuery, OffsetQuery } from './rest-schemas.js';

const c = initContract();

/** Wire shape served by the accounts handlers. */
export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  institutionId: z.string().nullable(),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.string(),
  archivedAt: z.string().nullable(),
  displayOrder: z.number().int(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateAccountBody = z.object({
  name: z.string().min(1, 'Name is required'),
  institutionId: z.string().nullable().optional(),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.string().min(1, 'Currency is required'),
  displayOrder: z.number().int().optional(),
  entityId: z.string().nullable().optional(),
});

const UpdateAccountBody = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  institutionId: z.string().nullable().optional(),
  kind: z.enum(ACCOUNT_KINDS).optional(),
  currency: z.string().min(1, 'Currency cannot be empty').optional(),
  displayOrder: z.number().int().optional(),
  entityId: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

const AccountMutation = z.object({ data: AccountSchema, message: z.string() });

const AccountQuery = z.object({
  search: z.string().optional(),
  kind: z.enum(ACCOUNT_KINDS).optional(),
  archived: z.enum(['true', 'false']).optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
});

const ReorderAccountsBody = z.object({
  accounts: z
    .array(z.object({ id: z.string(), displayOrder: z.number().int() }))
    .min(1, 'At least one account is required'),
});

export const financeAccountsContract = c.router({
  list: {
    method: 'GET',
    path: '/accounts',
    query: AccountQuery,
    responses: {
      200: z.object({
        data: z.array(AccountSchema),
        pagination: z.object({
          total: z.number(),
          limit: z.number(),
          offset: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    },
    summary: 'List accounts with optional search / kind / archived filters and pagination',
  },
  get: {
    method: 'GET',
    path: '/accounts/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: AccountSchema }), ...ERR_RESPONSES },
    summary: 'Get a single account',
  },
  create: {
    method: 'POST',
    path: '/accounts',
    body: CreateAccountBody,
    responses: { 201: AccountMutation, ...ERR_RESPONSES_WITH_422 },
    summary: 'Create a new account; rejects a reserved kind with 422',
  },
  reorder: {
    method: 'POST',
    path: '/accounts/reorder',
    body: ReorderAccountsBody,
    responses: {
      200: z.object({ data: z.array(AccountSchema), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary:
      'Batch-update display order for a set of accounts atomically; an unknown id 404s the whole batch',
  },
  update: {
    method: 'PATCH',
    path: '/accounts/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateAccountBody,
    responses: { 200: AccountMutation, ...ERR_RESPONSES_WITH_422 },
    summary:
      'Update an account, including unarchiving it by clearing archivedAt; rejects patching kind into a reserved value with 422',
  },
  delete: {
    method: 'DELETE',
    path: '/accounts/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: AccountMutation, ...ERR_RESPONSES },
    summary: 'Archive an account (sets archivedAt); idempotent if already archived',
  },
});
