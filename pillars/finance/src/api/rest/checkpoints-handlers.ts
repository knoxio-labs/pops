/**
 * Handlers for the `checkpoints.*` sub-router (POPS-2880, finance ADR-002).
 *
 * Three refusals live here rather than in the service, because each is about
 * what a PERSON is allowed to assert rather than what the table can hold:
 *
 * - a `asOf` in the future — a balance cannot have been read off a bank on a
 *   day that has not happened;
 * - an archived account — its history is frozen, and a new reading of it is
 *   either a mistake or a sign it should be unarchived first;
 * - deleting a machine-sourced checkpoint (409) — an `import` or `statement`
 *   figure is what a file said, and the next run of that import would mint it
 *   again. The fix for a wrong one is a newer checkpoint.
 */
import {
  accountCheckpointsService,
  balanceAsOf,
  balanceHistory,
  checkpointDelta,
  CheckpointSourceNotDeletableError,
  today,
  type FinanceDb,
} from '../../db/index.js';
import { toCheckpoint } from '../modules/checkpoints-types.js';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import { accountAccess, requireAccountRole } from './guest-access.js';
import { requireAccount } from './require-account.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { financeCheckpointsContract } from '../../contract/rest-checkpoints.js';

type Req = ServerInferRequest<typeof financeCheckpointsContract>;

const DEFAULT_HISTORY_MONTHS = 12;

/** 404 unless the account exists and the caller may read it; a guest's ungranted id is a missing one. */
function requireReadableAccount(db: FinanceDb, res: Response, id: string): void {
  requireAccountRole(accountAccess(res, db), id, 'view');
  requireAccount(db, id);
}

export function makeCheckpointsHandlers(db: FinanceDb) {
  return {
    list: ({ params, res }: Req['list'] & { res: Response }) =>
      runHttp(() => {
        requireReadableAccount(db, res, params.id);
        const rows = accountCheckpointsService.listCheckpoints(db, params.id);
        return {
          status: 200 as const,
          body: { data: rows.map((row) => toCheckpoint(row, checkpointDelta(db, row))) },
        };
      }),

    create: ({ params, body }: Req['create']) =>
      runHttp(() => {
        const account = requireAccount(db, params.id);
        if (account.archivedAt !== null) {
          throw new UnprocessableEntityError(
            `Account '${params.id}' is archived; unarchive it before recording a checkpoint`
          );
        }
        if (body.asOf > today()) {
          throw new UnprocessableEntityError(
            `Checkpoint date ${body.asOf} is in the future; a balance can only be read off a day that has happened`
          );
        }

        const row = accountCheckpointsService.insertCheckpoint(db, {
          accountId: params.id,
          balanceCents: body.balanceCents,
          asOf: body.asOf,
          source: 'manual',
          note: body.note ?? null,
        });
        return {
          status: 201 as const,
          body: {
            data: toCheckpoint(row, checkpointDelta(db, row)),
            message: 'Checkpoint recorded',
          },
        };
      }),

    remove: ({ params }: Req['remove']) =>
      runHttp(() => {
        requireAccount(db, params.id);
        const row = accountCheckpointsService.getCheckpoint(db, params.checkpointId);
        if (row === undefined || row.accountId !== params.id) {
          throw new NotFoundError('Checkpoint', params.checkpointId);
        }

        try {
          accountCheckpointsService.deleteCheckpoint(db, params.checkpointId);
        } catch (err) {
          if (err instanceof CheckpointSourceNotDeletableError)
            throw new ConflictError(err.message);
          throw err;
        }
        return { status: 204 as const, body: undefined };
      }),

    balance: ({ params, query, res }: Req['balance'] & { res: Response }) =>
      runHttp(() => {
        requireReadableAccount(db, res, params.id);
        return {
          status: 200 as const,
          body: { data: balanceAsOf(db, params.id, query.asOf ?? today()) },
        };
      }),

    history: ({ params, query, res }: Req['history'] & { res: Response }) =>
      runHttp(() => {
        requireReadableAccount(db, res, params.id);
        return {
          status: 200 as const,
          body: { data: balanceHistory(db, params.id, query.months ?? DEFAULT_HISTORY_MONTHS) },
        };
      }),
  };
}
