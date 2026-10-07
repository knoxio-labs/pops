/**
 * Handlers for the `transactions.*` sub-router.
 *
 * `list` and `get` live in `transactions-read-handlers.ts`, and `create`,
 * `update`, `delete` and `restore` in `transactions-write-handlers.ts`. Those
 * are the routes a guest reaches. What is defined here is operator-only.
 */
import { type FinanceDb, transactionsService, transferPairsService } from '../../db/index.js';
import { type ContactsClient } from '../contacts/client.js';
import { suggestTags as computeSuggestedTags } from '../modules/tag-suggester/index.js';
import { toTransaction } from '../modules/transactions-types.js';
import { type PurchasesReceiptsClient } from '../purchases/client.js';
import { runHttp } from './error-mapping.js';
import { makeTransactionReadHandlers } from './transactions-read-handlers.js';
import {
  makeTransactionWriteHandlers,
  translateTransactionError,
} from './transactions-write-handlers.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeTransactionsContract } from '../../contract/rest-transactions.js';

type Req = ServerInferRequest<typeof financeTransactionsContract>;

const PREVIEW_DESCRIPTIONS_LIMIT = 2000;

export function makeTransactionsHandlers(
  db: FinanceDb,
  contacts: ContactsClient,
  purchases: PurchasesReceiptsClient
) {
  const reads = makeTransactionReadHandlers(db);
  const writes = makeTransactionWriteHandlers(db, purchases);

  // Express registers these in key order, so `get` (`/transactions/:id`) has
  // to stay below the literal `suggest-tags` and `descriptions-preview` paths
  // or it answers for them.
  return {
    list: reads.list,

    suggestTags: ({ query }: Req['suggestTags']) =>
      runHttp(async () => {
        const entityId = query.entityId ?? null;
        const entityDefaultTags = entityId
          ? new Map([[entityId, await contacts.fetchEntityDefaultTags(entityId)]])
          : undefined;
        const suggested = computeSuggestedTags(db, {
          description: query.description,
          entityId,
          entityDefaultTags,
          recordTagRuleUsage: false,
        });
        return { status: 200 as const, body: { tags: suggested } };
      }),

    descriptionsForPreview: ({ query }: Req['descriptionsForPreview']) =>
      runHttp(() => ({
        status: 200 as const,
        body: transactionsService.listDescriptionsForPreview(
          db,
          query.limit ?? PREVIEW_DESCRIPTIONS_LIMIT
        ),
      })),

    get: reads.get,

    create: writes.create,

    update: writes.update,

    unlinkTransfer: ({ params }: Req['unlinkTransfer']) =>
      runHttp(() => {
        try {
          const row = transferPairsService.unlinkTransferPair(db, params.id);
          return {
            status: 200 as const,
            body: { data: toTransaction(row), message: 'Transfer unlinked' },
          };
        } catch (err) {
          translateTransactionError(err, params.id);
        }
      }),

    delete: writes.delete,

    restore: writes.restore,
  };
}
