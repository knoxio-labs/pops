/**
 * Handlers for the `web.*` sub-router (`src/contract/rest-web.ts`) — the
 * catalogue list and item detail D1 describes: a filtered, cursor-paged
 * slice of the new item model, and one item's detail with its history.
 */
import { eq } from 'drizzle-orm';

import { items, type InventoryDb } from '../../db/index.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { toSyncEvents } from '../sync/events.js';
import { readItemHistory } from '../sync/history.js';
import { loadItemExtras, projectItems, toSyncItem } from '../sync/wire.js';
import { readWebItemsPage } from '../web/items-page.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebContract } from '../../contract/rest-web.js';
import type { DocumentsClient } from '../documents/client.js';

type Req = ServerInferRequest<typeof inventoryWebContract>;

/** What the web handlers read and write through. */
export interface WebHandlerDeps {
  readonly db: InventoryDb;
  /** Resolves each page's Paperless availability, exactly as the sync handlers do. */
  readonly documents: DocumentsClient;
}

/** Handlers for `web.*`: the filtered item catalogue and item detail with history. */
export function makeWebHandlers({ db, documents }: WebHandlerDeps) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(async () => {
        if (query.typeKey !== undefined && query.untyped === 'true') {
          throw new ValidationError('typeKey cannot be combined with untyped=true');
        }
        if (query.typeKey !== undefined && query.legacyLabelOf !== undefined) {
          throw new ValidationError('typeKey cannot be combined with legacyLabelOf');
        }

        const page = db.transaction((tx) =>
          readWebItemsPage(
            tx,
            {
              typeKey: query.typeKey,
              placementKind: query.placementKind,
              locationId: query.locationId,
              containingItemId: query.containingItemId,
              ids: query.ids?.split(','),
              includeInactive: query.includeInactive,
              q: query.q,
              untyped: query.untyped === undefined ? undefined : query.untyped === 'true',
              isContainer:
                query.isContainer === undefined ? undefined : query.isContainer === 'true',
              access: query.access,
              isFull: query.isFull === undefined ? undefined : query.isFull === 'true',
              lifecycle: query.lifecycle,
              legacyLabelOf: query.legacyLabelOf,
              within: query.within,
              effectiveLocationId: query.effectiveLocationId,
            },
            { cursor: query.cursor, limit: query.limit, sort: query.sort }
          )
        );
        const extras = loadItemExtras(
          db,
          page.rows.map((row) => row.id)
        );
        return {
          status: 200 as const,
          body: {
            items: await projectItems({ items: page.rows, extras }, documents),
            nextCursor: page.nextCursor,
            total: page.total,
            unfilteredTotal: page.unfilteredTotal,
            hiddenInactiveCount: page.hiddenInactiveCount,
          },
        };
      }),

    get: ({ params, query }: Req['get']) =>
      runHttp(async () => {
        const row = db.select().from(items).where(eq(items.id, params.id)).get();
        if (!row) throw new NotFoundError('item', params.id);

        const history = readItemHistory(db, params.id, {
          cursor: query.historyCursor,
          limit: query.historyLimit,
        });
        // `row` above already proved the item exists, so `readItemHistory`
        // (which re-checks that itself) cannot return `null` here.
        if (!history) throw new NotFoundError('item', params.id);

        const extras = loadItemExtras(db, [row.id]);
        const [item] = await projectItems({ items: [row], extras }, documents);
        return {
          status: 200 as const,
          body: {
            item: item ?? toSyncItem(row, extras, true),
            history: { events: toSyncEvents(db, history.events), nextCursor: history.nextCursor },
          },
        };
      }),
  };
}
