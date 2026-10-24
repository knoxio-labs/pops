/**
 * Stand-ins for the media REST reads its loader-mounted detail and rotation
 * pages make on mount, so a spec that only asserts a page mounted does not race
 * the guard in `e2e/fixtures/pillar-rest-guard.ts` against requests it never
 * answered. Each stub set covers every read its page makes once the earlier
 * reads succeed, not only the first wave.
 *
 * Schemas are hand-mirrored from `pillars/media/openapi/media.openapi.json`
 * rather than imported, for the reason `helpers/media-schemas.ts` gives.
 */
import { z } from 'zod';

import {
  MovieSchema,
  PaginationMetaSchema,
  RotationSchedulerStatusResponseSchema,
  TvShowSchema,
  WatchlistStatusResponseSchema,
} from './media-schemas';
import { fulfilWith } from './pillar-rest';

import type { Page } from '@playwright/test';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const MovieResponseSchema = z.object({ data: MovieSchema }).strict();
const TvShowResponseSchema = z.object({ data: TvShowSchema }).strict();

const WatchHistoryListSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.number(),
          mediaType: z.string(),
          mediaId: z.number(),
          watchedAt: z.string(),
          completed: z.number(),
        })
        .strict()
    ),
    pagination: PaginationMetaSchema,
  })
  .strict();

const StalenessResponseSchema = z
  .object({ data: z.object({ staleness: z.number() }).strict() })
  .strict();

const ArrConfigResponseSchema = z
  .object({
    data: z.object({ radarrConfigured: z.boolean(), sonarrConfigured: z.boolean() }).strict(),
  })
  .strict();

const ComparisonDimensionsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.number(),
          name: z.string(),
          description: nullableString,
          active: z.boolean(),
          sortOrder: z.number(),
          weight: z.number(),
          createdAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

const ComparisonScoresResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.number(),
          mediaType: z.string(),
          mediaId: z.number(),
          dimensionId: z.number(),
          score: z.number(),
          comparisonCount: z.number(),
          confidence: z.number(),
          excluded: z.boolean(),
          updatedAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

const SeasonsListSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.number(),
          tvShowId: z.number(),
          tvdbId: z.number(),
          seasonNumber: z.number(),
          name: nullableString,
          overview: nullableString,
          posterPath: nullableString,
          posterUrl: nullableString,
          airDate: nullableString,
          episodeCount: nullableNumber,
          createdAt: z.string(),
        })
        .strict()
    ),
    total: z.number(),
  })
  .strict();

const EpisodesListSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.number(),
          seasonId: z.number(),
          tvdbId: z.number(),
          episodeNumber: z.number(),
          name: nullableString,
          overview: nullableString,
          airDate: nullableString,
          stillPath: nullableString,
          voteAverage: nullableNumber,
          runtime: nullableNumber,
          createdAt: z.string(),
        })
        .strict()
    ),
    total: z.number(),
  })
  .strict();

const SonarrSeriesCheckSchema = z
  .object({
    data: z
      .object({
        exists: z.boolean(),
        sonarrId: z.number().optional(),
        monitored: z.boolean().optional(),
        seasons: z
          .array(z.object({ seasonNumber: z.number(), monitored: z.boolean() }).strict())
          .optional(),
      })
      .strict(),
  })
  .strict();

const ProgressCountSchema = z
  .object({ watched: z.number(), total: z.number(), percentage: z.number() })
  .strict();

const ShowProgressResponseSchema = z
  .object({
    data: z
      .object({
        tvShowId: z.number(),
        overall: ProgressCountSchema,
        seasons: z.array(
          z
            .object({
              seasonId: z.number(),
              seasonNumber: z.number(),
              watched: z.number(),
              total: z.number(),
              percentage: z.number(),
            })
            .strict()
        ),
        nextEpisode: z
          .object({
            seasonNumber: z.number(),
            episodeNumber: z.number(),
            episodeName: nullableString,
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

const RotationCandidatesSchema = z
  .object({
    data: z
      .object({
        items: z.array(
          z
            .object({
              id: z.number(),
              sourceId: z.number(),
              tmdbId: z.number(),
              title: z.string(),
              year: nullableNumber,
              rating: nullableNumber,
              posterPath: nullableString,
              status: z.string(),
              discoveredAt: z.string(),
              sourceName: nullableString,
              sourcePriority: nullableNumber,
            })
            .strict()
        ),
        total: z.number(),
      })
      .strict(),
  })
  .strict();

const STAMP = '2026-10-01T09:00:00.000Z';

/**
 * `GET /movies/:id` and everything the movie detail page reads once it has a
 * movie: watch history (both page sizes), staleness, comparison dimensions and
 * scores, the arr config, the rotation scheduler and the watchlist status.
 */
export async function stubMovieDetail(page: Page, id: number): Promise<void> {
  await page.route(
    new RegExp(`/media-api/movies/${id}$`),
    fulfilWith(
      200,
      MovieResponseSchema,
      {
        data: {
          id,
          tmdbId: 27205,
          imdbId: null,
          title: 'Some movie',
          originalTitle: null,
          overview: null,
          tagline: null,
          releaseDate: null,
          runtime: null,
          status: null,
          originalLanguage: null,
          budget: null,
          revenue: null,
          posterPath: null,
          posterUrl: null,
          backdropPath: null,
          backdropUrl: null,
          logoPath: null,
          logoUrl: null,
          posterOverridePath: null,
          voteAverage: null,
          voteCount: null,
          genres: [],
          createdAt: STAMP,
          updatedAt: STAMP,
          rotationStatus: null,
          rotationExpiresAt: null,
        },
      },
      'media.movies.get'
    )
  );
  await page.route(
    new RegExp(`/media-api/watch-history\\?mediaType=movie&mediaId=${id}(&|$)`),
    fulfilWith(
      200,
      WatchHistoryListSchema,
      { data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } },
      'media.watchHistory.list'
    )
  );
  await page.route(
    new RegExp(`/media-api/comparison-staleness\\?mediaType=movie&mediaId=${id}$`),
    fulfilWith(200, StalenessResponseSchema, { data: { staleness: 0 } }, 'media.staleness')
  );
  await page.route(
    /\/media-api\/comparison-dimensions$/,
    fulfilWith(200, ComparisonDimensionsResponseSchema, { data: [] }, 'media.dimensions')
  );
  await page.route(
    new RegExp(`/media-api/comparison-scores\\?mediaType=movie&mediaId=${id}$`),
    fulfilWith(200, ComparisonScoresResponseSchema, { data: [] }, 'media.comparisonScores')
  );
  await page.route(
    /\/media-api\/arr\/config$/,
    fulfilWith(
      200,
      ArrConfigResponseSchema,
      { data: { radarrConfigured: false, sonarrConfigured: false } },
      'media.arr.config'
    )
  );
  await page.route(
    /\/media-api\/rotation\/scheduler\/status$/,
    fulfilWith(
      200,
      RotationSchedulerStatusResponseSchema,
      {
        data: {
          isRunning: false,
          isCycleRunning: false,
          intervalMs: 86_400_000,
          cronExpression: '0 3 * * *',
          lastCycleAt: null,
          lastCycleError: null,
          nextRunAt: null,
        },
      },
      'media.rotation.schedulerStatus'
    )
  );
  await page.route(
    new RegExp(`/media-api/watchlist/status\\?mediaType=movie&mediaId=${id}$`),
    fulfilWith(
      200,
      WatchlistStatusResponseSchema,
      { onWatchlist: false, entryId: null },
      'media.watchlist.status'
    )
  );
}

/**
 * `GET /tv-shows/:id`, its seasons (including `seasonNumber`), that season's
 * episodes, the Sonarr check and the show's watch progress.
 */
export async function stubSeasonDetail(
  page: Page,
  showId: number,
  seasonNumber: number
): Promise<void> {
  const tvdbId = 81189;
  const seasonId = 9000 + seasonNumber;
  await page.route(
    new RegExp(`/media-api/tv-shows/${showId}$`),
    fulfilWith(
      200,
      TvShowResponseSchema,
      {
        data: {
          id: showId,
          tvdbId,
          name: 'Some show',
          originalName: null,
          overview: null,
          firstAirDate: null,
          lastAirDate: null,
          status: null,
          originalLanguage: null,
          numberOfSeasons: seasonNumber,
          numberOfEpisodes: null,
          episodeRunTime: null,
          posterPath: null,
          posterUrl: null,
          backdropPath: null,
          backdropUrl: null,
          logoPath: null,
          logoUrl: null,
          posterOverridePath: null,
          voteAverage: null,
          voteCount: null,
          genres: [],
          networks: [],
          createdAt: STAMP,
          updatedAt: STAMP,
        },
      },
      'media.tvShows.get'
    )
  );
  await page.route(
    new RegExp(`/media-api/tv-shows/${showId}/seasons$`),
    fulfilWith(
      200,
      SeasonsListSchema,
      {
        data: [
          {
            id: seasonId,
            tvShowId: showId,
            tvdbId: 70000 + seasonNumber,
            seasonNumber,
            name: `Season ${seasonNumber}`,
            overview: null,
            posterPath: null,
            posterUrl: null,
            airDate: null,
            episodeCount: 0,
            createdAt: STAMP,
          },
        ],
        total: 1,
      },
      'media.tvShows.seasons'
    )
  );
  await page.route(
    new RegExp(`/media-api/seasons/${seasonId}/episodes$`),
    fulfilWith(200, EpisodesListSchema, { data: [], total: 0 }, 'media.seasons.episodes')
  );
  await page.route(
    new RegExp(`/media-api/arr/sonarr/series/${tvdbId}/check$`),
    fulfilWith(200, SonarrSeriesCheckSchema, { data: { exists: false } }, 'media.sonarr.check')
  );
  await page.route(
    new RegExp(`/media-api/watch-history/progress/${showId}$`),
    fulfilWith(
      200,
      ShowProgressResponseSchema,
      {
        data: {
          tvShowId: showId,
          overall: { watched: 0, total: 0, percentage: 0 },
          seasons: [],
          nextEpisode: null,
        },
      },
      'media.watchHistory.progress'
    )
  );
}

/** `GET /rotation/candidates`, for every page and filter the candidate queue asks for. */
export async function stubRotationCandidates(page: Page): Promise<void> {
  await page.route(
    /\/media-api\/rotation\/candidates\?/,
    fulfilWith(
      200,
      RotationCandidatesSchema,
      { data: { items: [], total: 0 } },
      'media.rotation.candidates'
    )
  );
}
