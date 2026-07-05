/**
 * ts-rest handler composer for the documents pillar.
 *
 * Stitches the per-module handler factories into the typed
 * `RouterImplementation<DocumentsContract>` that `createExpressEndpoints`
 * consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { documentsContract } from '../../contract/rest.js';
import { makePaperlessHandlers } from './paperless-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeDocumentsRestHandlers(): ReturnType<
  typeof server.router<typeof documentsContract>
> {
  return server.router(documentsContract, {
    paperless: makePaperlessHandlers(),
  });
}
