import { requirePaperlessClient, throwPaperlessFailure } from '../paperless-errors.js';
import { toWireDocument } from './wire-document.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { documentsWriteContract } from '../../contract/rest-write.js';

type Req = ServerInferRequest<typeof documentsWriteContract>;

/** Handlers for the `write.*` sub-router: 412 unconfigured, 404 only when Paperless says the document is gone. */
export function makeWriteHandlers() {
  return {
    update: async ({ params, body }: Req['update']) => {
      const client = requirePaperlessClient();
      const document = await client
        .updateDocument(params.id, body)
        .catch((err: unknown) => throwPaperlessFailure(err, params.id));
      return { status: 200 as const, body: { data: toWireDocument(client, document) } };
    },

    delete: async ({ params }: Req['delete']) => {
      const client = requirePaperlessClient();
      await client
        .deleteDocument(params.id)
        .catch((err: unknown) => throwPaperlessFailure(err, params.id));
      return { status: 204 as const, body: undefined };
    },
  };
}
