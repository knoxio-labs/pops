/**
 * `accounts/:id/checkpoints` and `accounts/:id/balance*` sub-router
 * (POPS-2880, ADR-051).
 *
 * A checkpoint is a balance read off something outside the ledger, and the
 * balance routes are the ledger's answer measured against it. They sit
 * together because they are two views of one fact: the account page shows the
 * balance and its provenance, the checkpoints page shows what the provenance
 * is made of.
 *
 * There is no update route. Checkpoints are append-only — a corrected count
 * is a new row — and `remove` only accepts a `manual` one: an `import` or
 * `statement` figure is what a file said, so the fix for a wrong one is a
 * newer checkpoint, not a delete that the next import would undo.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  AccountBalanceSchema,
  BalanceHistoryPointSchema,
  BalanceHistoryQuerySchema,
  BalanceQuerySchema,
  CheckpointSchema,
  CreateCheckpointInputSchema,
} from './rest-checkpoints-schemas.js';
import { ERR_RESPONSES, ERR_RESPONSES_WITH_422, MessageSchema } from './rest-schemas.js';

const c = initContract();

const AccountParams = z.object({ id: z.string() });

export const financeCheckpointsContract = c.router({
  list: {
    method: 'GET',
    path: '/accounts/:id/checkpoints',
    pathParams: AccountParams,
    responses: { 200: z.object({ data: z.array(CheckpointSchema) }), ...ERR_RESPONSES },
    summary:
      'List an account’s checkpoints, newest first, each with what the ledger predicted for it',
  },
  create: {
    method: 'POST',
    path: '/accounts/:id/checkpoints',
    pathParams: AccountParams,
    body: CreateCheckpointInputSchema,
    responses: {
      201: z.object({ data: CheckpointSchema, message: z.string() }),
      ...ERR_RESPONSES_WITH_422,
    },
    summary:
      'Record a balance read off the bank or counted by hand; always source manual. ' +
      '422s a future date or an archived account',
  },
  remove: {
    method: 'DELETE',
    path: '/accounts/:id/checkpoints/:checkpointId',
    pathParams: AccountParams.extend({ checkpointId: z.string() }),
    body: z.object({}).optional(),
    responses: { 204: MessageSchema.optional(), ...ERR_RESPONSES },
    summary:
      'Delete a manual checkpoint; 409s an import or statement one, which is corrected by ' +
      'recording a newer checkpoint rather than removing what a file said',
  },
  balance: {
    method: 'GET',
    path: '/accounts/:id/balance',
    pathParams: AccountParams,
    query: BalanceQuerySchema,
    responses: { 200: z.object({ data: AccountBalanceSchema }), ...ERR_RESPONSES },
    summary: 'An account’s balance as of a date (default today), and what it was anchored on',
  },
  history: {
    method: 'GET',
    path: '/accounts/:id/balance-history',
    pathParams: AccountParams,
    query: BalanceHistoryQuerySchema,
    responses: {
      200: z.object({ data: z.array(BalanceHistoryPointSchema) }),
      ...ERR_RESPONSES,
    },
    summary: 'Month-end balances for the last `months` months (default 12), oldest first',
  },
});
