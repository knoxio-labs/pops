/**
 * Paperless-ngx tRPC router — connection status, health check, and document search.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { getPaperlessClient, getPaperlessBaseUrl } from "./index.js";
import { PaperlessApiError } from "./types.js";

export const paperlessRouter = router({
  /** Check if Paperless-ngx is configured and reachable. */
  status: protectedProcedure.query(async () => {
    const client = getPaperlessClient();

    if (!client) {
      return { data: { configured: false, available: false, baseUrl: null } };
    }

    const baseUrl = getPaperlessBaseUrl();

    try {
      await client.getDocumentTypes();
      return { data: { configured: true, available: true, baseUrl } };
    } catch {
      return { data: { configured: true, available: false, baseUrl } };
    }
  }),

  /** Proxy a document thumbnail from Paperless-ngx as base64. */
  thumbnail: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const client = getPaperlessClient();
      if (!client) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Paperless-ngx is not configured",
        });
      }

      try {
        const result = await client.getDocumentThumbnail(input.documentId);
        if (!result) {
          return { data: null };
        }
        return {
          data: {
            base64: result.data.toString("base64"),
            contentType: result.contentType,
          },
        };
      } catch (err) {
        if (err instanceof PaperlessApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Paperless error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Search Paperless-ngx documents by query string. */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(200) }))
    .query(async ({ input }) => {
      const client = getPaperlessClient();
      if (!client) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Paperless-ngx is not configured",
        });
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
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Paperless error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
});
