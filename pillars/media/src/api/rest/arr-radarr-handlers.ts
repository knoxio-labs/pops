/**
 * Handlers for the Radarr routes of the `arr.*` sub-router (movies +
 * config/queue). Thin wrappers over the Radarr client in
 * `../clients/arr`; unconfigured services raise `ConflictError` (409) via
 * `requireRadarr`.
 *
 * `downloadAndProtect` creates a POPS library entry via `moviesService` and
 * marks it `protected`. NOTE: the monolith enriched that entry with TMDB
 * metadata (`addMovieToLibrary`) which lives in the library/rotation domain
 * (wave 3); here the column write happens with the data on the request,
 * deferring the metadata enrichment.
 */
import {
  type MediaDb,
  MovieConflictError,
  MovieNotFoundError,
  moviesService,
} from '../../db/index.js';
import {
  clearMovieStatusCache,
  getArrConfig,
  getArrSettings,
  getDownloadQueue,
  getMovieStatus,
  getRotationDefaults,
  testRadarr,
  testRadarrSaved,
} from '../clients/arr/index.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { requireRadarr, type ArrReq } from './arr-handlers-shared.js';
import { runHttp } from './error-mapping.js';

export function makeRadarrHandlers(db: MediaDb) {
  return {
    config: () => runHttp(() => ({ status: 200 as const, body: { data: getArrConfig(db) } })),

    settings: () =>
      runHttp(() => {
        const s = getArrSettings(db);
        return {
          status: 200 as const,
          body: {
            data: {
              radarrUrl: s.radarrUrl ?? '',
              radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
              sonarrUrl: s.sonarrUrl ?? '',
              sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
            },
          },
        };
      }),

    queue: () =>
      runHttp(async () => ({ status: 200 as const, body: { data: await getDownloadQueue(db) } })),

    getRadarrQualityProfiles: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr(db).getQualityProfiles() },
      })),

    getRadarrRootFolders: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr(db).getRootFolders() },
      })),

    testRadarr: ({ body }: ArrReq['testRadarr']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await testRadarr(body.url, body.apiKey),
      })),

    testRadarrSaved: () =>
      runHttp(async () => ({ status: 200 as const, body: await testRadarrSaved(db) })),

    addMovie: ({ body }: ArrReq['addMovie']) =>
      runHttp(async () => {
        const movie = await requireRadarr(db).addMovie(body);
        clearMovieStatusCache(body.tmdbId);
        return { status: 201 as const, body: { data: movie } };
      }),

    checkMovie: ({ params }: ArrReq['checkMovie']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr(db).checkMovie(params.tmdbId) },
      })),

    getMovieStatus: ({ params }: ArrReq['getMovieStatus']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getMovieStatus(db, params.tmdbId) },
      })),

    updateRadarrMonitoring: ({ params, body }: ArrReq['updateRadarrMonitoring']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr(db).updateMonitoring(params.radarrId, body.monitored) },
      })),

    triggerRadarrSearch: ({ params }: ArrReq['triggerRadarrSearch']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requireRadarr(db).triggerSearch(params.radarrId) },
      })),

    downloadAndProtect: ({ body }: ArrReq['downloadAndProtect']) =>
      runHttp(async () => {
        const client = requireRadarr(db);
        const defaults = getRotationDefaults(db);
        if (!defaults) {
          throw new ConflictError(
            'Radarr download defaults not configured (quality profile / root folder)'
          );
        }
        const check = await client.checkMovie(body.tmdbId);
        if (!check.exists) {
          await client.addMovie({
            tmdbId: body.tmdbId,
            title: body.title,
            year: body.year,
            qualityProfileId: defaults.qualityProfileId,
            rootFolderPath: defaults.rootFolderPath,
          });
        }
        clearMovieStatusCache(body.tmdbId);

        const existing = moviesService.getMovieByTmdbId(db, body.tmdbId);
        const movie = existing ?? createProtectedLibraryEntry(db, body);
        moviesService.setRotationStatus(db, movie.id, 'protected');

        return { status: 200 as const, body: { data: { alreadyInRadarr: check.exists } } };
      }),
  };
}

function createProtectedLibraryEntry(
  db: MediaDb,
  input: { tmdbId: number; title: string; year: number }
): moviesService.MovieRow {
  try {
    return moviesService.createMovie(db, {
      tmdbId: input.tmdbId,
      title: input.title,
      releaseDate: `${input.year}-01-01`,
    });
  } catch (err) {
    if (err instanceof MovieConflictError) {
      const existing = moviesService.getMovieByTmdbId(db, input.tmdbId);
      if (existing) return existing;
      throw new ConflictError(err.message);
    }
    if (err instanceof MovieNotFoundError) {
      throw new NotFoundError('Movie', String(input.tmdbId));
    }
    throw err;
  }
}
