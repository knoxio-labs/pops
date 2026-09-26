import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/fixtures/service.js';
import { paginationMeta } from '../shared/pagination.js';
import { loadItemExtras, projectItems } from '../sync/wire.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryFixturesContract } from '../../contract/rest-fixtures.js';
import type { DocumentsClient } from '../documents/client.js';

type Req = ServerInferRequest<typeof inventoryFixturesContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** Handlers for the `fixtures.*` sub-router — fixture CRUD + item↔fixture edges. */
export function makeFixturesHandlers(db: InventoryDb, documents: DocumentsClient) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listFixtures(db, {
          search: query.search,
          locationId: query.locationId,
          type: query.type,
          limit,
          offset,
        });
        return { status: 200 as const, body: { data: rows, total } };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => ({ status: 200 as const, body: { data: service.getFixture(db, params.id) } })),

    create: ({ body }: Req['create']) =>
      runHttp(() => ({
        status: 201 as const,
        body: { data: service.createFixture(db, body), message: 'Fixture created' },
      })),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: service.updateFixture(db, params.id, body), message: 'Fixture updated' },
      })),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        service.deleteFixture(db, params.id);
        return { status: 200 as const, body: { message: 'Fixture deleted' } };
      }),

    connect: ({ params }: Req['connect']) =>
      runHttp(() => ({
        status: 201 as const,
        body: {
          data: service.connectItemToFixture(db, params.itemId, params.fixtureId),
          message: 'Item connected to fixture',
        },
      })),

    listItems: ({ params, query }: Req['listItems']) =>
      runHttp(async () => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const page = service.listItemsForFixture(db, params.fixtureId, limit, offset);
        const extras = loadItemExtras(
          db,
          page.rows.map((row) => row.id)
        );
        return {
          status: 200 as const,
          body: {
            data: await projectItems({ items: page.rows, extras }, documents),
            pagination: paginationMeta(page.total, limit, offset),
          },
        };
      }),

    disconnect: ({ params }: Req['disconnect']) =>
      runHttp(() => {
        service.disconnectItemFromFixture(db, params.itemId, params.fixtureId);
        return { status: 200 as const, body: { message: 'Item disconnected from fixture' } };
      }),

    listForItem: ({ params, query }: Req['listForItem']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listFixturesForItem(db, params.itemId, limit, offset);
        return {
          status: 200 as const,
          body: { data: rows, pagination: paginationMeta(total, limit, offset) },
        };
      }),
  };
}
