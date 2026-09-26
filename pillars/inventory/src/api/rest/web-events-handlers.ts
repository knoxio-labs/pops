import { toSyncEvents } from '../sync/events.js';
import { readWebEventsPage } from '../web/events-page.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebEventsContract } from '../../contract/rest-web-events.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebEventsContract>;

function eventKey(entityKind: string, entityId: string): string {
  return `${entityKind}:${entityId}`;
}

/** Build the global activity feed handler for `GET /web/events`. */
export function makeWebEventsHandlers(db: InventoryDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const page = db.transaction((tx) => {
          const result = readWebEventsPage(
            tx,
            {
              kinds: query.kind?.split(','),
              actorKind: query.actorKind,
              entityId: query.entityId,
              q: query.q,
            },
            { cursor: query.cursor, limit: query.limit }
          );
          const events = toSyncEvents(tx, result.rows).map((event) => {
            const entityName = result.names.get(eventKey(event.entityKind, event.entityId));
            if (entityName === undefined) {
              throw new Error(`event ${event.seq} refers to a missing ${event.entityKind}`);
            }
            return { ...event, entityName };
          });
          return { ...result, events };
        });

        return {
          status: 200 as const,
          body: {
            events: page.events,
            nextCursor: page.nextCursor,
            kindCounts: page.kindCounts,
            total: page.total,
          },
        };
      }),
  };
}
