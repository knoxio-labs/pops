/** Handlers for the ranked `webSearch.*` inventory REST sub-router. */
import { loadItemExtras, projectItems } from '../sync/wire.js';
import { readWebSearchPage } from '../web/search.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebSearchContract } from '../../contract/rest-web-search.js';
import type { InventoryDb } from '../../db/index.js';
import type { DocumentsClient } from '../documents/client.js';

type Req = ServerInferRequest<typeof inventoryWebSearchContract>;

/** Dependencies used by the web-search handlers. */
export interface WebSearchHandlerDeps {
  readonly db: InventoryDb;
  readonly documents: DocumentsClient;
}

/** Build handlers for `GET /web/search`, including wire projection of hits. */
export function makeWebSearchHandlers({ db, documents }: WebSearchHandlerDeps) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(async () => {
        const page = db.transaction((tx) =>
          readWebSearchPage(tx, {
            q: query.q,
            cursor: query.cursor,
            limit: query.limit,
            activeOnly: query.activeOnly === 'true',
            typeKey: query.typeKey ?? null,
            within: query.within ?? null,
          })
        );
        const rows = [
          ...(page.exact === null ? [] : [page.exact]),
          ...page.items.map((hit) => hit.row),
        ];
        const extras = loadItemExtras(
          db,
          rows.map((row) => row.id)
        );
        const projected = await projectItems({ items: rows, extras }, documents);
        const projectedById = new Map(projected.map((item) => [item.id, item]));
        return {
          status: 200 as const,
          body: {
            exact: page.exact === null ? null : (projectedById.get(page.exact.id) ?? null),
            items: page.items.flatMap((hit) => {
              const item = projectedById.get(hit.row.id);
              return item === undefined ? [] : [{ item, tier: hit.tier, field: hit.field }];
            }),
            places: page.places.map((hit) => ({
              location: { id: hit.row.id },
              tier: hit.tier,
            })),
            nextCursor: page.nextCursor,
            total: page.total,
          },
        };
      }),
  };
}
