import { readValueReport } from '../web/value-report.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebReportsContract } from '../../contract/rest-web-reports.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebReportsContract>;

/** Build handlers for reports consumed by the inventory web application. */
export function makeWebReportsHandlers(db: InventoryDb) {
  return {
    values: ({ query }: Req['values']) =>
      runHttp(() => ({
        status: 200 as const,
        body: db.transaction((tx) => readValueReport(tx, query)),
      })),
  };
}
