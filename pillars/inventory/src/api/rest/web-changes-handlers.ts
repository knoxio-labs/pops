import { readChangesHead } from '../web/changes-head.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebChangesContract } from '../../contract/rest-web-changes.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebChangesContract>;

/** Build the changed-elsewhere cursor handler for `GET /web/changes/head`. */
export function makeWebChangesHandlers(db: InventoryDb) {
  return {
    head: ({ query }: Req['head']) =>
      runHttp(() => ({
        status: 200 as const,
        body: db.transaction((tx) => readChangesHead(tx, query)),
      })),
  };
}
