import { createDocumentsClient, type DocumentsClient } from '../documents/client.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryPaperlessContract } from '../../contract/rest-paperless.js';

type Req = ServerInferRequest<typeof inventoryPaperlessContract>;

/**
 * Handlers for inventory's `paperless.*` sub-router. The paperless-ngx
 * integration itself lives in the `documents` bridge pillar (ADR-039
 * workstream 13) — these handlers proxy to it over `pillar('documents')`
 * with graceful degrade, so inventory's own wire contract (and therefore
 * its frontend) is unchanged by the move.
 */
export function makePaperlessHandlers(documents: DocumentsClient = createDocumentsClient()) {
  return {
    status: async () => {
      const data = await documents.getPaperlessStatus();
      return { status: 200 as const, body: { data } };
    },

    search: async ({ query }: Req['search']) => {
      const documentsFound = await documents.searchPaperlessDocuments(query.query);
      if (documentsFound === null) {
        return {
          status: 412 as const,
          body: {
            message: 'Paperless-ngx is not configured',
            messageKey: 'inventory.paperless.notConfigured',
          },
        };
      }
      return { status: 200 as const, body: { data: documentsFound } };
    },
  };
}
