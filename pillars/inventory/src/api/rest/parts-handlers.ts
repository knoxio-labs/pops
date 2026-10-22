import { type InventoryDb } from '../../db/index.js';
import { addPart, getItemParts, removePart } from '../modules/parts/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { itemPartsRoutes } from '../../contract/rest-parts.js';

type Req = ServerInferRequest<typeof itemPartsRoutes>;

/** Handlers for the `items.*Parts` routes, spread into the items handlers. */
export function makePartsHandlers(db: InventoryDb) {
  return {
    getParts: ({ params }: Req['getParts']) =>
      runHttp(() => ({ status: 200 as const, body: { data: getItemParts(db, params.itemId) } })),
    addPart: ({ params, body }: Req['addPart']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: addPart(db, params.itemId, body.partItemId) },
      })),
    removePart: ({ params }: Req['removePart']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: removePart(db, params.itemId, params.partItemId) },
      })),
  };
}
