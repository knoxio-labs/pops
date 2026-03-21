/**
 * Arr tRPC router — Radarr/Sonarr integration endpoints.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { ArrApiError } from "./types.js";
import * as arrService from "./service.js";

export const arrRouter = router({
  /** Test Radarr connection and return server version. */
  testRadarr: protectedProcedure.query(async () => {
    const client = arrService.getRadarrClient();
    if (!client) {
      return { data: null, connected: false, error: "Radarr is not configured" };
    }

    try {
      const status = await client.testConnection();
      return { data: status, connected: true, message: "Radarr connection successful" };
    } catch (err) {
      const message = err instanceof ArrApiError ? err.message : "Connection failed";
      return { data: null, connected: false, error: message };
    }
  }),

  /** Test Sonarr connection and return server version. */
  testSonarr: protectedProcedure.query(async () => {
    const client = arrService.getSonarrClient();
    if (!client) {
      return { data: null, connected: false, error: "Sonarr is not configured" };
    }

    try {
      const status = await client.testConnection();
      return { data: status, connected: true, message: "Sonarr connection successful" };
    } catch (err) {
      const message = err instanceof ArrApiError ? err.message : "Connection failed";
      return { data: null, connected: false, error: message };
    }
  }),

  /** Get configuration state for both services. */
  getConfig: protectedProcedure.query(() => {
    return { data: arrService.getArrConfig() };
  }),

  /** Get Radarr status for a movie by TMDB ID. */
  getMovieStatus: protectedProcedure
    .input(z.object({ tmdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = await arrService.getMovieStatus(input.tmdbId);
      return { data: result };
    }),

  /** Get combined download queue from Radarr + Sonarr. */
  getDownloadQueue: protectedProcedure.query(async () => {
    try {
      const items = await arrService.getDownloadQueue();
      return { data: items };
    } catch (err) {
      if (err instanceof ArrApiError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Arr queue error: ${err.message}`,
        });
      }
      throw err;
    }
  }),

  /** Get Sonarr status for a TV show by TVDB ID. */
  getShowStatus: protectedProcedure
    .input(z.object({ tvdbId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = await arrService.getShowStatus(input.tvdbId);
      return { data: result };
    }),
});
