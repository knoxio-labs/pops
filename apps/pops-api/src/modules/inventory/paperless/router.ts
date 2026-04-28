/**
 * Paperless-ngx tRPC router — connection status, health check, and document search.
 */
import { z } from 'zod';

import { trpcError } from '../../../shared/trpc-error.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getPaperlessClient } from './index.js';
import { PaperlessApiError } from './types.js';

export const paperlessRouter = router({
  /** Check if Paperless-ngx is configured and reachable. */
  status: protectedProcedure.query(async () => {
    const client = getPaperlessClient();

    if (!client) {
      return { data: { configured: false, available: false, baseUrl: null } };
    }

    try {
      await client.getDocumentTypes();
      return { data: { configured: true, available: true, baseUrl: client.getBaseUrl() } };
    } catch {
      return { data: { configured: true, available: false, baseUrl: client.getBaseUrl() } };
    }
  }),

  /** Search Paperless-ngx documents by query string. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(200) }))
    .query(async ({ input }) => {
      const client = getPaperlessClient();
      if (!client) {
        throw trpcError('PRECONDITION_FAILED', 'inventory.paperless.notConfigured');
      }

      try {
        const result = await client.searchDocuments(input.query);
        return {
          data: result.documents.map((doc) => ({
            id: doc.id,
            title: doc.title,
            created: doc.created,
            originalFileName: doc.originalFileName,
            thumbnailUrl: client.getDocumentThumbnailUrl(doc.id),
          })),
        };
      } catch (err) {
        if (err instanceof PaperlessApiError) {
          throw trpcError(
            'INTERNAL_SERVER_ERROR',
            'inventory.paperless.apiError',
            { detail: err.message },
            err
          );
        }
        throw err;
      }
    }),
});
