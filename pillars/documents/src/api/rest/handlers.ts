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
import { makeUploadHandlers } from './upload-handlers.js';
import { makeWriteHandlers } from './write-handlers.js';

import type { DurableUploads } from '../uploads/service.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeDocumentsRestHandlers(
  uploads?: DurableUploads
): ReturnType<typeof server.router<typeof documentsContract>> {
  return server.router(documentsContract, {
    paperless: { ...makePaperlessHandlers(), upload: makeUploadHandlers(uploads).upload },
    write: {
      ...makeWriteHandlers(),
      createUpload: makeUploadHandlers(uploads).createUpload,
      dispatchUpload: makeUploadHandlers(uploads).dispatchUpload,
    },
  });
}
