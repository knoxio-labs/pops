import {
  ContainerDestinationLocationNotFoundError,
  ContainerNotFoundError,
  ContainerOriginLocationNotFoundError,
  containersService,
  toContainer,
  type InventoryDb,
} from '../../db/index.js';
import { toInventoryItem } from '../modules/items/types.js';
import { NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryContainersContract } from '../../contract/rest-containers.js';

type Req = ServerInferRequest<typeof inventoryContainersContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function translateContainerError(err: unknown): never {
  if (err instanceof ContainerNotFoundError) throw new NotFoundError('Container', err.id);
  if (err instanceof ContainerOriginLocationNotFoundError) {
    throw new NotFoundError('Origin location', err.id);
  }
  if (err instanceof ContainerDestinationLocationNotFoundError) {
    throw new NotFoundError('Destination location', err.id);
  }
  throw err;
}

/**
 * Handlers for the `containers.*` sub-router. `translateContainerError`
 * maps db domain errors to shared HttpError subclasses so `runHttp`
 * yields 404s, mirroring `locations-handlers.ts`.
 */
export function makeContainersHandlers(db: InventoryDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const { rows, total } = containersService.listContainers(db, { state: query.state });
        return { status: 200 as const, body: { data: rows.map(toContainer), total } };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: toContainer(containersService.getContainer(db, params.id)) },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    items: ({ params, query }: Req['items']) =>
      runHttp(() => {
        try {
          const limit = query.limit ?? DEFAULT_LIMIT;
          const offset = query.offset ?? DEFAULT_OFFSET;
          const { rows, total } = containersService.getContainerItems(db, params.id, limit, offset);
          return {
            status: 200 as const,
            body: {
              data: rows.map(toInventoryItem),
              pagination: paginationMeta(total, limit, offset),
            },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = containersService.createContainer(db, body);
          return {
            status: 201 as const,
            body: { data: toContainer(row), message: 'Container created' },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = containersService.updateContainer(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toContainer(row), message: 'Container updated' },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    seal: ({ params }: Req['seal']) =>
      runHttp(() => {
        try {
          const row = containersService.sealContainer(db, params.id);
          return {
            status: 200 as const,
            body: { data: toContainer(row), message: 'Container sealed' },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    move: ({ params, body }: Req['move']) =>
      runHttp(() => {
        try {
          const row = containersService.moveContainer(db, params.id, body.destinationLocationId);
          return {
            status: 200 as const,
            body: { data: toContainer(row), message: 'Container moved' },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    unpack: ({ params }: Req['unpack']) =>
      runHttp(() => {
        try {
          const row = containersService.unpackContainer(db, params.id);
          return {
            status: 200 as const,
            body: { data: toContainer(row), message: 'Container unpacked' },
          };
        } catch (err) {
          translateContainerError(err);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          containersService.deleteContainer(db, params.id);
          return { status: 200 as const, body: { message: 'Container deleted' } };
        } catch (err) {
          translateContainerError(err);
        }
      }),
  };
}
