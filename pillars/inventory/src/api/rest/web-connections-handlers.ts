import { readConnectionsPage } from '../web/connections-registry.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebConnectionsContract } from '../../contract/rest-web-connections.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebConnectionsContract>;

/** Build the resolved, read-only `GET /web/connections` handler. */
export function makeWebConnectionsHandlers(db: InventoryDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: db.transaction((tx) =>
          readConnectionsPage(
            tx,
            { kind: query.kind, q: query.q },
            { cursor: query.cursor, limit: query.limit }
          )
        ),
      })),
  };
}
