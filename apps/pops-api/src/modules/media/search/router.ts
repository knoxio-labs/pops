/**
 * Media search tRPC router — exposes TMDB movie search and TheTVDB series search.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { getTmdbClient, TmdbApiError } from "../tmdb/index.js";
import { getTvdbClient } from "../thetvdb/index.js";
import { TvdbApiError } from "../thetvdb/types.js";

const SearchMoviesSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().positive().max(500).optional().default(1),
});

const SearchTvShowsSchema = z.object({
  query: z.string().min(1).max(200),
});

export const searchRouter = router({
  /** Search movies via TMDB. */
  movies: protectedProcedure
    .input(SearchMoviesSchema)
    .query(async ({ input }) => {
      const client = getTmdbClient();
      if (!client) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TMDB_API_KEY is not configured",
        });
      }
      try {
        const response = await client.searchMovies(input.query, input.page);
        return {
          results: response.results,
          totalResults: response.totalResults,
          totalPages: response.totalPages,
          page: response.page,
        };
      } catch (err) {
        if (err instanceof TmdbApiError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `TMDB API error: ${err.message}`,
          });
        }
        throw err;
      }
    }),

  /** Search TV shows via TheTVDB. */
  tvShows: protectedProcedure
    .input(SearchTvShowsSchema)
    .query(async ({ input }) => {
      const client = getTvdbClient();
      if (!client) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "THETVDB_API_KEY is not configured",
        });
      }
      try {
        const results = await client.searchSeries(input.query);
        return { results };
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
