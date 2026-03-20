/**
 * Library tRPC router — add media to local library from external APIs.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { toTvShow, toSeason } from "../tv-shows/types.js";
import { getTvdbClient } from "../thetvdb/index.js";
import { TvdbApiError } from "../thetvdb/types.js";
import * as tvShowService from "./tv-show-service.js";

export const libraryRouter = router({
  /** Add a TV show to the local library by TVDB ID. Idempotent. */
  addTvShow: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        const client = getTvdbClient();
        if (!client) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "THETVDB_API_KEY environment variable is not set",
          });
        }
        const result = await tvShowService.addTvShow(input.tvdbId, client);
        return {
          data: {
            show: toTvShow(result.show),
            seasons: result.seasons.map(toSeason),
          },
          created: result.created,
          message: result.created
            ? "TV show added to library"
            : "TV show already in library",
        };
      } catch (err) {
        if (err instanceof TvdbApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `TheTVDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
});
