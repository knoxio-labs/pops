import { runWebBatch } from '../web/batch-create.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebBatchContract } from '../../contract/rest-web-batch.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebBatchContract>;

/** Build the partial-accept web item batch handler. */
export function makeWebBatchHandlers(db: InventoryDb) {
  return {
    create: ({ body }: Req['create']) =>
      runHttp(() => ({ status: 200 as const, body: runWebBatch(db, body) })),
  };
}
