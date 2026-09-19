import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/items/service.js';
import { toInventoryItem } from '../modules/items/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';
import { makeItemsWriteHandlers } from './items-write-handlers.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryItemsContract } from '../../contract/rest-items.js';

type Req = ServerInferRequest<typeof inventoryItemsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function parseTriBool(value: 'true' | 'false' | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Handlers for the `items.*` ts-rest sub-router. The reads here are thin
 * pass-throughs to the items service; the mutating handlers
 * (`items-write-handlers.ts`) go through the command engine (POPS-4053),
 * recorded against actor `web`, with the legacy response shape unchanged
 * for purchases' fan-out and the MCP tools. `runHttp` maps service
 * `HttpError`s (NotFound → 404) to response envelopes.
 */
export function makeItemsHandlers(db: InventoryDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total, totalReplacementValue, totalResaleValue } = service.listInventoryItems(
          db,
          {
            search: query.search,
            room: query.room,
            type: query.type,
            condition: query.condition,
            inUse: parseTriBool(query.inUse),
            deductible: parseTriBool(query.deductible),
            limit,
            offset,
            locationId: query.locationId,
            containerId: query.containerId,
            assetId: query.assetId,
            includeChildren: query.includeChildren,
          }
        );
        return {
          status: 200 as const,
          body: {
            data: rows.map(toInventoryItem),
            pagination: paginationMeta(total, limit, offset),
            totals: { totalReplacementValue, totalResaleValue },
          },
        };
      }),

    searchByAssetId: ({ query }: Req['searchByAssetId']) =>
      runHttp(() => {
        const row = service.searchByAssetId(db, query.assetId);
        return { status: 200 as const, body: { data: row ? toInventoryItem(row) : null } };
      }),

    countByAssetPrefix: ({ query }: Req['countByAssetPrefix']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: service.countByAssetPrefix(db, query.prefix) },
      })),

    distinctTypes: () =>
      runHttp(() => ({ status: 200 as const, body: { data: service.getDistinctTypes(db) } })),

    get: ({ params }: Req['get']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: toInventoryItem(service.getInventoryItem(db, params.id)) },
      })),

    ...makeItemsWriteHandlers(db),
  };
}
