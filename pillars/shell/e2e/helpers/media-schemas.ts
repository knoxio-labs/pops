/**
 * Media response schemas shared by the shell specs that stub the media pillar,
 * hand-mirrored from its contract rather than imported: `shell-no-cross-internal`
 * (`.dependency-cruiser.cjs`) keeps the shell out of `@pops/media`.
 */
import { z } from 'zod';

/**
 * Mirrors `MovieSchema` (`pillars/media/src/contract/rest-movies.ts`). `rotationStatus` is
 * nullable on purpose; `media-library-search-add-movie.spec.ts` explains why.
 */
export const MovieSchema = z
  .object({
    id: z.number(),
    tmdbId: z.number(),
    imdbId: z.string().nullable(),
    title: z.string(),
    originalTitle: z.string().nullable(),
    overview: z.string().nullable(),
    tagline: z.string().nullable(),
    releaseDate: z.string().nullable(),
    runtime: z.number().nullable(),
    status: z.string().nullable(),
    originalLanguage: z.string().nullable(),
    budget: z.number().nullable(),
    revenue: z.number().nullable(),
    posterPath: z.string().nullable(),
    posterUrl: z.string().nullable(),
    backdropPath: z.string().nullable(),
    backdropUrl: z.string().nullable(),
    logoPath: z.string().nullable(),
    logoUrl: z.string().nullable(),
    posterOverridePath: z.string().nullable(),
    voteAverage: z.number().nullable(),
    voteCount: z.number().nullable(),
    genres: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    rotationStatus: z.enum(['leaving', 'protected']).nullable(),
    rotationExpiresAt: z.string().nullable(),
  })
  .strict();

/** `PaginationMetaSchema` (`pillars/media/src/contract/rest-schemas.ts`). */
export const PaginationMetaSchema = z
  .object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  })
  .strict();

/** Mirrors `TvShowSchema` (`pillars/media/src/contract/rest-tv-shows-schemas.ts`). */
export const TvShowSchema = z
  .object({
    id: z.number(),
    tvdbId: z.number(),
    name: z.string(),
    originalName: z.string().nullable(),
    overview: z.string().nullable(),
    firstAirDate: z.string().nullable(),
    lastAirDate: z.string().nullable(),
    status: z.string().nullable(),
    originalLanguage: z.string().nullable(),
    numberOfSeasons: z.number().nullable(),
    numberOfEpisodes: z.number().nullable(),
    episodeRunTime: z.number().nullable(),
    posterPath: z.string().nullable(),
    posterUrl: z.string().nullable(),
    backdropPath: z.string().nullable(),
    backdropUrl: z.string().nullable(),
    logoPath: z.string().nullable(),
    logoUrl: z.string().nullable(),
    posterOverridePath: z.string().nullable(),
    voteAverage: z.number().nullable(),
    voteCount: z.number().nullable(),
    genres: z.array(z.string()),
    networks: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

/** Mirrors `SchedulerStatusSchema` (`pillars/media/src/contract/rest-rotation-scheduler.ts`). */
export const RotationSchedulerStatusResponseSchema = z
  .object({
    data: z
      .object({
        isRunning: z.boolean(),
        isCycleRunning: z.boolean(),
        intervalMs: z.number(),
        cronExpression: z.string(),
        lastCycleAt: z.string().nullable(),
        lastCycleError: z.string().nullable(),
        nextRunAt: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

/** `GET /watchlist/status` 200 — `mediaWatchlistContract.status` (`rest-watchlist.ts`). */
export const WatchlistStatusResponseSchema = z
  .object({ onWatchlist: z.boolean(), entryId: z.number().nullable() })
  .strict();
