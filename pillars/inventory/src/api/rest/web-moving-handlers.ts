/** Handlers for the moving-day aggregate REST sub-router. */
import { readMovingDay } from '../web/moving-day.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebMovingContract } from '../../contract/rest-web-moving.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebMovingContract>;

/** Build the read-only `GET /web/moving-day` handler. */
export function makeWebMovingHandlers(db: InventoryDb) {
  return {
    get: ({ query }: Req['get']) =>
      runHttp(() => ({
        status: 200 as const,
        body: readMovingDay(db, {
          destinationField: query.destinationField,
          ...(query.homeLocationId === undefined ? {} : { homeLocationId: query.homeLocationId }),
        }),
      })),
  };
}
