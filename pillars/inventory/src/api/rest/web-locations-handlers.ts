import { NotFoundError } from '../shared/errors.js';
import { readLocationGone } from '../web/location-gone.js';
import { readLocationTallies } from '../web/location-tallies.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebLocationsContract } from '../../contract/rest-web-locations.js';
import type { InventoryDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof inventoryWebLocationsContract>;

/** Build handlers for inventory location web reads. */
export function makeWebLocationsHandlers(db: InventoryDb) {
  return {
    tallies: () =>
      runHttp(() => ({
        status: 200 as const,
        body: readLocationTallies(db),
      })),
    gone: ({ params }: Req['gone']) =>
      runHttp(() => {
        const body = readLocationGone(db, params.id);
        if (body === null) throw new NotFoundError('location', params.id);
        return { status: 200 as const, body };
      }),
  };
}
