/**
 * Library tRPC router — high-level procedures for adding media to the library.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { TmdbClient } from "../tmdb/client.js";
import { TokenBucketRateLimiter } from "../tmdb/rate-limiter.js";
import { TmdbApiError } from "../tmdb/types.js";
import { NotFoundError } from "../../../shared/errors.js";
import { toMovie } from "../movies/types.js";
import { RefreshMovieSchema } from "./types.js";
import * as libraryService from "./service.js";

/** Shared rate limiter: TMDB allows 40 req / 10 s → 4 req/s. */
const tmdbRateLimiter = new TokenBucketRateLimiter(40, 4);

function getTmdbClient(): TmdbClient {
  const apiKey = process.env["TMDB_API_KEY"];
  if (!apiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "TMDB_API_KEY is not configured",
    });
  }
  return new TmdbClient(apiKey, tmdbRateLimiter);
}

export const libraryRouter = router({
  /**
   * Add a movie to the library by TMDB ID.
   * Idempotent — returns existing record if already in library.
   */
  addMovie: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const client = getTmdbClient();
      try {
        const { movie, created } = await libraryService.addMovie(
          input.tmdbId,
          client,
        );
        return {
          data: movie,
          created,
          message: created ? "Movie added to library" : "Movie already in library",
        };
      } catch (err) {
        if (err instanceof TmdbApiError) {
          if (err.status === 404) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Movie not found on TMDB (ID: ${input.tmdbId})`,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `TMDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Refresh movie metadata from TMDB. */
  refreshMovie: protectedProcedure
    .input(RefreshMovieSchema)
    .mutation(async ({ input }) => {
      const tmdbClient = getTmdbClient();
      try {
        const row = await libraryService.refreshMovie(
          input.id,
          tmdbClient,
        );
        return {
          data: toMovie(row),
          message: "Movie metadata refreshed",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof TmdbApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `TMDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),
});
