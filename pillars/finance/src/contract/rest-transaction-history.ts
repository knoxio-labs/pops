/**
 * `transactions/:id/history` and `accounts/:id/history` sub-router
 * (POPS-5865, epic POPS-5827).
 *
 * The audit log read back: who created, changed, deleted or restored an entry
 * through the transaction routes, and what it said either side. There is no
 * route that writes, changes or removes an event; the log is appended by the
 * transaction writes themselves.
 *
 * An event carries the fields a person reads off an entry and nothing else.
 * The stored snapshot also holds the import's raw row, its dedup checksum and
 * the rule-match columns, and none of those is ever returned here.
 *
 * Both routes are open to a guest (POPS-5866), who is shown only events lying
 * wholly on accounts granted to them.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { guestRoute } from '@pops/pillar-sdk/server';

import { TRANSACTION_EVENT_ACTIONS, TRANSACTION_EVENT_ACTOR_KINDS } from '../db/index.js';
import { TransactionTypeSchema } from './rest-corrections-schemas.js';
import { ERR_RESPONSES, LimitQuery, OffsetQuery, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

/** The fields of an entry a history reader is shown, in the order they are compared. */
export const TRANSACTION_HISTORY_FIELDS = [
  'accountId',
  'date',
  'amount',
  'description',
  'type',
  'notes',
  'entityId',
  'entityName',
  'tags',
] as const;

export const TransactionHistoryFieldSchema = z.enum(TRANSACTION_HISTORY_FIELDS);

/** An entry as it stood at one moment. `amount` is dollars, as on every transaction shape. */
export const TransactionHistoryFieldsSchema = z.object({
  accountId: z.string(),
  date: z.string(),
  amount: z.number(),
  description: z.string(),
  type: TransactionTypeSchema,
  notes: z.string().nullable(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export const TransactionHistoryEventSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  /** The account the entry sat on once the action had been applied. */
  accountId: z.string(),
  action: z.enum(TRANSACTION_EVENT_ACTIONS),
  actorKind: z.enum(TRANSACTION_EVENT_ACTOR_KINDS),
  /** Null for a service, and for an operator request that carried no sign-in. */
  actorEmail: z.string().nullable(),
  at: z.string(),
  /** Null for a create and a restore. */
  before: TransactionHistoryFieldsSchema.nullable(),
  /** Null for a delete. */
  after: TransactionHistoryFieldsSchema.nullable(),
  /** Which fields differ between `before` and `after`. Empty unless both are present. */
  changed: z.array(TransactionHistoryFieldSchema),
});

export const financeTransactionHistoryContract = c.router({
  forTransaction: {
    method: 'GET',
    path: '/transactions/:id/history',
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: z.object({ data: z.array(TransactionHistoryEventSchema) }),
      ...ERR_RESPONSES,
    },
    summary:
      'Who created, changed, deleted or restored a transaction, newest first. ' +
      'Still answers for a deleted transaction; 404s an id that never had a row or an event',
  },
  forAccount: {
    method: 'GET',
    path: '/accounts/:id/history',
    metadata: guestRoute(),
    pathParams: z.object({ id: z.string() }),
    query: z.object({ limit: LimitQuery, offset: OffsetQuery }),
    responses: {
      200: z.object({
        data: z.array(TransactionHistoryEventSchema),
        pagination: PaginationMetaSchema,
      }),
      ...ERR_RESPONSES,
    },
    summary:
      'Changes to the transactions of an account, newest first, including deleted ' +
      'transactions and ones since moved to another account',
  },
});
