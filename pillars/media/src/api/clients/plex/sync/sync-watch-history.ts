/**
 * Standalone watch-history sync — re-syncs watch data from Plex for movies
 * and TV shows that are ALREADY in the local library. Unlike the full sync
 * (sync-movies / sync-tv) it does not import new media.
 *
 * Also mirrors unfinished plays into `watch_progress`. Plex carries a
 * `viewOffset` only while a title is part-watched, so this pass is the whole
 * truth: what it does not see in progress is no longer in progress.
 *
 * Ported from the monolith `media/plex/sync-watch-history.ts`, converted to
 * the pillar's `(db, …)` services.
 */
import { type MediaDb, moviesService, watchProgressService } from '../../../../db/index.js';
import { type EpisodeSyncDiagnostics, syncEpisodeWatches } from './sync-episode-match.js';
import { extractExternalIdAsNumber, logMovieWatch } from './sync-helpers.js';

import type { PlexClient } from '../client.js';
import type { PlexMediaItem } from '../types.js';

/**
 * The slice of the Plex client this sync actually uses. Narrower than
 * `PlexClient` so a caller — or a test — only has to supply what is called.
 */
export type WatchHistoryPlexClient = Pick<PlexClient, 'getAllItems' | 'getEpisodes'>;

export interface ShowWatchDiagnostics {
  title: string;
  tvdbId: number;
  plexViewedLeafCount: number | null;
  diagnostics: EpisodeSyncDiagnostics;
}

export interface MovieWatchSyncResult {
  total: number;
  watched: number;
  /** Unfinished plays mirrored into `watch_progress` this run. */
  partial: number;
  logged: number;
  alreadyLogged: number;
  noLocalMatch: number;
}

export interface WatchHistorySyncResult {
  movies: MovieWatchSyncResult | null;
  shows: ShowWatchDiagnostics[];
  summary: {
    moviesLogged: number;
    episodesLogged: number;
    episodesAlreadyLogged: number;
    showsProcessed: number;
    showsWithGaps: number;
  };
}

function resolveLocalMovieId(db: MediaDb, item: PlexMediaItem): number | null {
  const tmdbId = extractExternalIdAsNumber(item, 'tmdb');
  if (!tmdbId) return null;
  return moviesService.getMovieByTmdbId(db, tmdbId)?.id ?? null;
}

/**
 * Mirror an unfinished play. Returns `false` when Plex reports no offset, which
 * is the ordinary case — an untouched title carries no `viewOffset` at all.
 */
function recordPartialPlay(db: MediaDb, movieId: number, item: PlexMediaItem): boolean {
  const viewOffsetMs = item.viewOffsetMs;
  if (viewOffsetMs === null || viewOffsetMs <= 0) return false;
  watchProgressService.recordProgress(db, {
    mediaType: 'movie',
    mediaId: movieId,
    viewOffsetMs,
    durationMs: item.durationMs,
  });
  return true;
}

function syncMovieWatches(db: MediaDb, plexItems: PlexMediaItem[]): MovieWatchSyncResult {
  const result: MovieWatchSyncResult = {
    total: plexItems.length,
    watched: 0,
    partial: 0,
    logged: 0,
    alreadyLogged: 0,
    noLocalMatch: 0,
  };

  const partiallyWatchedMovieIds: number[] = [];

  for (const item of plexItems) {
    if (item.viewCount === 0) {
      const movieId = resolveLocalMovieId(db, item);
      if (movieId !== null && recordPartialPlay(db, movieId, item)) {
        partiallyWatchedMovieIds.push(movieId);
        result.partial++;
      }
      continue;
    }
    result.watched++;
    const tmdbId = extractExternalIdAsNumber(item, 'tmdb');
    if (!tmdbId) {
      result.noLocalMatch++;
      continue;
    }
    const movie = moviesService.getMovieByTmdbId(db, tmdbId);
    if (!movie) {
      result.noLocalMatch++;
      continue;
    }
    if (logMovieWatch(db, movie.id, item.lastViewedAt)) result.logged++;
    else result.alreadyLogged++;
  }

  // Plex reports an offset only while a title is unfinished and clears it on
  // completion, so anything absent from this pass is no longer part-watched.
  watchProgressService.retainOnly(db, 'movie', partiallyWatchedMovieIds);
  return result;
}

async function syncTvShowWatches(
  db: MediaDb,
  plexClient: WatchHistoryPlexClient,
  tvItems: PlexMediaItem[]
): Promise<ShowWatchDiagnostics[]> {
  const showResults: ShowWatchDiagnostics[] = [];
  for (const item of tvItems) {
    const tvdbId = extractExternalIdAsNumber(item, 'tvdb');
    if (!tvdbId) continue;
    const plexEpisodes = await plexClient.getEpisodes(item.ratingKey);
    const diagnostics = syncEpisodeWatches(db, tvdbId, plexEpisodes);
    if (diagnostics.plexWatched > 0) {
      showResults.push({
        title: item.title,
        tvdbId,
        plexViewedLeafCount: item.viewedLeafCount,
        diagnostics,
      });
    }
  }
  return showResults;
}

function summarise(
  movieResult: MovieWatchSyncResult | null,
  showResults: ShowWatchDiagnostics[]
): WatchHistorySyncResult['summary'] {
  const episodesLogged = showResults.reduce((sum, s) => sum + s.diagnostics.matched, 0);
  const episodesAlreadyLogged = showResults.reduce(
    (sum, s) => sum + s.diagnostics.alreadyLogged,
    0
  );
  const showsWithGaps = showResults.filter((s) => {
    if (s.plexViewedLeafCount === null) return false;
    const totalTracked = s.diagnostics.matched + s.diagnostics.alreadyLogged;
    return totalTracked < s.plexViewedLeafCount;
  }).length;
  return {
    moviesLogged: movieResult?.logged ?? 0,
    episodesLogged,
    episodesAlreadyLogged,
    showsProcessed: showResults.length,
    showsWithGaps,
  };
}

/** Re-sync watch history for already-imported movies + TV shows. */
export async function syncWatchHistoryFromPlex(
  db: MediaDb,
  plexClient: WatchHistoryPlexClient,
  movieSectionId?: string,
  tvSectionId?: string
): Promise<WatchHistorySyncResult> {
  const movieItems = movieSectionId ? await plexClient.getAllItems(movieSectionId) : [];
  const tvItems = tvSectionId ? await plexClient.getAllItems(tvSectionId) : [];

  const movieResult = movieItems.length > 0 ? syncMovieWatches(db, movieItems) : null;
  const showResults = await syncTvShowWatches(db, plexClient, tvItems);

  return {
    movies: movieResult,
    shows: showResults,
    summary: summarise(movieResult, showResults),
  };
}
