import { getPaperlessClient } from '../modules/paperless/index.js';
import { PaperlessApiError } from '../modules/paperless/types.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { documentsPaperlessContract } from '../../contract/rest-paperless.js';
import type { PaperlessClient } from '../modules/paperless/client.js';
import type { PaperlessDocument } from '../modules/paperless/types.js';

type Req = ServerInferRequest<typeof documentsPaperlessContract>;

interface WireDocument {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

const NOT_CONFIGURED = {
  status: 412 as const,
  body: {
    message: 'Paperless-ngx is not configured',
    messageKey: 'documents.paperless.notConfigured',
  },
};

function toWireDocument(client: PaperlessClient, doc: PaperlessDocument): WireDocument {
  return {
    id: doc.id,
    title: doc.title,
    created: doc.created,
    originalFileName: doc.originalFileName,
    thumbnailUrl: client.getDocumentThumbnailUrl(doc.id),
  };
}

/**
 * Re-throw anything that is not a Paperless 404 as a 500.
 *
 * The separation matters to the consumers' soft-URI crons (ADR-042): a 404
 * is the pillar asserting the document is gone and licenses stamping
 * `staleAt`; a network error, a timeout or a Paperless 5xx must reach the
 * caller as `unavailable` so the reference is left exactly as it was and
 * retried on the next tick. Collapsing the two would let one Paperless
 * outage mark every referenced document stale fleet-wide.
 */
function rethrowNonNotFound(err: unknown): never {
  if (err instanceof PaperlessApiError) {
    throw new Error(`Paperless error: ${err.message}`, { cause: err });
  }
  throw err;
}

/** Handlers for the `paperless.*` sub-router. No db; `search`/`get` return 412 when Paperless is unconfigured. */
export function makePaperlessHandlers() {
  return {
    status: async () => {
      const client = getPaperlessClient();
      if (!client) {
        return {
          status: 200 as const,
          body: { data: { configured: false, available: false, baseUrl: null } },
        };
      }
      try {
        await client.getDocumentTypes();
        return {
          status: 200 as const,
          body: { data: { configured: true, available: true, baseUrl: client.getBaseUrl() } },
        };
      } catch {
        return {
          status: 200 as const,
          body: { data: { configured: true, available: false, baseUrl: client.getBaseUrl() } },
        };
      }
    },

    search: async ({ query }: Req['search']) => {
      const client = getPaperlessClient();
      if (!client) {
        return NOT_CONFIGURED;
      }
      try {
        const result = await client.searchDocuments(query.query);
        return {
          status: 200 as const,
          body: { data: result.documents.map((doc) => toWireDocument(client, doc)) },
        };
      } catch (err) {
        rethrowNonNotFound(err);
      }
    },

    get: async ({ params }: Req['get']) => {
      const client = getPaperlessClient();
      if (!client) {
        return NOT_CONFIGURED;
      }
      try {
        return {
          status: 200 as const,
          body: { data: toWireDocument(client, await client.getDocument(params.id)) },
        };
      } catch (err) {
        if (err instanceof PaperlessApiError && err.status === 404) {
          return {
            status: 404 as const,
            body: {
              message: `Document ${String(params.id)} not found`,
              messageKey: 'documents.paperless.notFound',
            },
          };
        }
        return rethrowNonNotFound(err);
      }
    },
  };
}
