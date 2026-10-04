/**
 * Handlers for Finance's shared-tag carrier routes. Unknown shared ids get
 * one coalesced vocabulary sync pass and one retry before they are rejected.
 */
import { z } from 'zod';

import {
  FeeTagOnNonFeeTypeError,
  transactionSharedTagsService,
  type FinanceDb,
  type SharedTagMutationResult,
  type TransactionSharedTagCursor,
} from '../../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTaggedContract } from '../../contract/rest-tagged.js';

type Req = ServerInferRequest<typeof financeTaggedContract>;

const CursorSchema = z
  .object({
    beforeDate: z.string().min(1),
    beforeId: z.string().min(1),
  })
  .strict();

function invalidCursor(): ValidationError {
  return new ValidationError('The tagged query cursor is invalid. Start the list again.');
}

function decodeCursor(value: string | undefined): TransactionSharedTagCursor | undefined {
  if (value === undefined) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw invalidCursor();
  }
  const result = CursorSchema.safeParse(parsed);
  if (!result.success) throw invalidCursor();
  return result.data;
}

function encodeCursor(cursor: TransactionSharedTagCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function executeMutation(action: () => SharedTagMutationResult): SharedTagMutationResult {
  try {
    return action();
  } catch (error) {
    if (error instanceof FeeTagOnNonFeeTypeError) throw new ValidationError(error.message);
    throw error;
  }
}

function respondToMutation(result: SharedTagMutationResult) {
  switch (result.kind) {
    case 'updated':
    case 'unchanged':
      return { status: 200 as const, body: { tagIds: result.tagIds } };
    case 'transaction-not-found':
      throw new NotFoundError('Transaction', result.transactionId);
    case 'unknown-tag':
      throw new ValidationError(`Unknown shared tag id '${result.tagId}'`, {
        tagId: result.tagId,
      });
    case 'facet-conflict':
      throw new ConflictError(
        `Tag '${result.tagId}' conflicts with the existing '${result.facet}' facet assignment.`
      );
  }
}

async function mutateWithOneSyncRetry(
  action: () => SharedTagMutationResult,
  syncSharedTagsOnce: () => Promise<unknown>
) {
  let result = executeMutation(action);
  if (result.kind === 'unknown-tag') {
    await syncSharedTagsOnce();
    result = executeMutation(action);
  }
  return respondToMutation(result);
}

export function makeTaggedHandlers(
  db: FinanceDb,
  syncSharedTagsOnce: (() => Promise<unknown>) | undefined
) {
  const syncOnce = syncSharedTagsOnce ?? (async () => undefined);

  return {
    list: ({ body }: Req['list']) =>
      runHttp(() => {
        const cursor = decodeCursor(body.cursor);
        const page = transactionSharedTagsService.listTransactionsBySharedTagIds(
          db,
          body.tagIds,
          body.limit ?? 200,
          cursor
        );
        return {
          status: 200 as const,
          body: {
            items: page.items.map((transaction) => ({
              uri: `pops://finance/transaction/${transaction.id}`,
              entityType: 'transaction' as const,
              title: transaction.description,
              tagIds: transaction.tagIds,
              date: transaction.date,
              amountCents: transaction.amountCents,
            })),
            nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
          },
        };
      }),

    attach: ({ params }: Req['attach']) =>
      runHttp(() =>
        mutateWithOneSyncRetry(
          () => transactionSharedTagsService.attachSharedTag(db, params.entityId, params.tagId),
          syncOnce
        )
      ),

    detach: ({ params }: Req['detach']) =>
      runHttp(() =>
        mutateWithOneSyncRetry(
          () => transactionSharedTagsService.detachSharedTag(db, params.entityId, params.tagId),
          syncOnce
        )
      ),
  };
}
