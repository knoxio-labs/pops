/**
 * Item documents tRPC router — link/unlink Paperless-ngx documents to inventory items.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import { LinkDocumentSchema, DocumentQuerySchema, toDocument } from "./types.js";
import * as service from "./service.js";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";

import { getEnv } from "../../../env.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const documentsRouter = router({
  /** Check if Paperless is configured and get base URL for UI links. */
  config: protectedProcedure.query(() => {
    const url = getEnv("PAPERLESS_URL");
    const token = getEnv("PAPERLESS_TOKEN");
    return {
      isConfigured: !!(url && token),
      baseUrl: url ? url.replace(/\/$/, "") : null,
    };
  }),

  /** Link a Paperless-ngx document to an inventory item. */
  link: protectedProcedure.input(LinkDocumentSchema).mutation(({ input }) => {
    try {
      const row = service.linkDocument(input);
      return {
        data: toDocument(row),
        message: "Document linked",
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
  }),

  /** Unlink a document by link ID. */
  unlink: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => {
      try {
        service.unlinkDocument(input.id);
        return { message: "Document unlinked" };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** List all documents linked to an item. */
  listByItem: protectedProcedure.input(DocumentQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listDocumentsForItem(input.itemId, limit, offset);

    return {
      data: rows.map(toDocument),
      pagination: paginationMeta(total, limit, offset),
    };
  }),
});
