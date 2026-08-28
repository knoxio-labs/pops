import {
  addSeries,
  checkSeries,
  getSeriesEpisodes,
  getShowStatus,
  getSonarrCalendar,
  getSonarrLanguageProfiles,
  getSonarrQualityProfiles,
  getSonarrRootFolders,
  testSonarr,
  testSonarrSaved,
  triggerSeriesSearch,
  updateEpisodeMonitoring,
  updateSeasonMonitoring,
  updateSeriesMonitoring,
} from '../clients/arr/index.js';
import { requireSonarr, type ArrReq } from './arr-handlers-shared.js';
import { runHttp } from './error-mapping.js';

/**
 * Handlers for the Sonarr routes of the `arr.*` sub-router
 * (series/season/episode + calendar). Thin wrappers over the Sonarr client
 * in `../clients/arr`; unconfigured services raise `ConflictError` (409) via
 * `requireSonarr`. The connection-test routes swallow failures and report
 * them in the `200` body (`connected:false`).
 *
 * The db is only read for the stored Sonarr connection settings; these
 * handlers write nothing to it.
 */
import type { MediaDb } from '../../db/index.js';

export function makeSonarrHandlers(db: MediaDb) {
  return {
    getSonarrQualityProfiles: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrQualityProfiles(db) },
      })),

    getSonarrRootFolders: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrRootFolders(db) },
      })),

    getSonarrLanguageProfiles: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrLanguageProfiles(db) },
      })),

    getCalendar: ({ query }: ArrReq['getCalendar']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getSonarrCalendar(db, query.start, query.end) },
      })),

    testSonarr: ({ body }: ArrReq['testSonarr']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await testSonarr(body.url, body.apiKey),
      })),

    testSonarrSaved: () =>
      runHttp(async () => ({ status: 200 as const, body: await testSonarrSaved(db) })),

    updateEpisodeMonitoring: ({ body }: ArrReq['updateEpisodeMonitoring']) =>
      runHttp(async () => {
        requireSonarr(db);
        await updateEpisodeMonitoring(db, body.episodeIds, body.monitored);
        return {
          status: 200 as const,
          body: {
            message: `Updated ${body.episodeIds.length} episode(s) monitoring to ${body.monitored}`,
          },
        };
      }),

    addSeries: ({ body }: ArrReq['addSeries']) =>
      runHttp(async () => {
        requireSonarr(db);
        return { status: 201 as const, body: { data: await addSeries(db, body) } };
      }),

    checkSeries: ({ params }: ArrReq['checkSeries']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await checkSeries(db, params.tvdbId) },
      })),

    getShowStatus: ({ params }: ArrReq['getShowStatus']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await getShowStatus(db, params.tvdbId) },
      })),

    getSeriesEpisodes: ({ params, query }: ArrReq['getSeriesEpisodes']) =>
      runHttp(async () => {
        requireSonarr(db);
        return {
          status: 200 as const,
          body: { data: await getSeriesEpisodes(db, params.sonarrId, query.seasonNumber) },
        };
      }),

    updateSeriesMonitoring: ({ params, body }: ArrReq['updateSeriesMonitoring']) =>
      runHttp(async () => {
        requireSonarr(db);
        return {
          status: 200 as const,
          body: { data: await updateSeriesMonitoring(db, params.sonarrId, body.monitored) },
        };
      }),

    updateSeasonMonitoring: ({ params, body }: ArrReq['updateSeasonMonitoring']) =>
      runHttp(async () => {
        requireSonarr(db);
        await updateSeasonMonitoring(db, params.sonarrId, params.seasonNumber, body.monitored);
        return {
          status: 200 as const,
          body: { message: `Season ${params.seasonNumber} monitoring set to ${body.monitored}` },
        };
      }),

    triggerSeriesSearch: ({ params, body }: ArrReq['triggerSeriesSearch']) =>
      runHttp(async () => {
        requireSonarr(db);
        return {
          status: 200 as const,
          body: { data: await triggerSeriesSearch(db, params.sonarrId, body?.seasonNumber) },
        };
      }),
  };
}
