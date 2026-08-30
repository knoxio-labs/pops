/**
 * Pure-db queries for the rotation removal phase + leaving lifecycle.
 *
 * HTTP-free; `(db, …)`-arg. Ported from the monolith `removal-selection.ts`
 * (the SQLite parts) + `leaving-lifecycle.ts`. The Radarr-touching pieces
 * (disk space, per-movie sizes, the download queue, the actual delete) live in
 * the api layer (`rotation-removal.ts`); this module only reads/writes the
 * `movies` + `watchlist` tables. The pillar's watchlist is local, so
 * watchlist exclusion joins the pillar `watchlist` table rather than the
 * monolith's shared `media_watchlist`.
 */
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { mediaScores, mediaWatchlist, movies, watchHistory } from '../../schema.js';

import type { MediaDb } from '../internal.js';

/** Map of TMDB id → size in GB, as measured from Radarr. */
export type MovieSizeMap = Map<number, number>;

/**
 * An eligible movie plus every signal the removal ranking scores it on.
 *
 * `createdAt` is deliberately absent: a bulk import wrote a near-constant value
 * across the library, and ordering by it is what deleted films alphabetically
 * (POPS-2578). Acquisition dates come from Radarr instead.
 */
export interface EligibleMovie {
  id: number;
  tmdbId: number;
  title: string;
  /**
   * Watches counted to completion, excluding any the viewer disavowed. A
   * partial play is not a watch, and neither is a blacklisted one.
   */
  watchCount: number;
  lastWatchedAt: string | null;
  /** Mean Elo across the dimensions this movie has actually been compared on. */
  elo: number | null;
  eloComparisons: number;
  voteAverage: number | null;
  voteCount: number | null;
}

export interface LeavingMovie {
  id: number;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  rotationExpiresAt: string | null;
  rotationMarkedAt: string | null;
}

export interface ExpiredMovie {
  id: number;
  tmdbId: number;
  title: string;
}

/**
 * Movies eligible for removal, each carrying the signals the ranking scores.
 *
 * Excludes watchlist items, unexpired protected movies, currently-downloading
 * movies, and movies with no Radarr file (size 0 / absent). Already-`leaving`
 * movies are filtered in SQL.
 *
 * Returned in no meaningful order — ordering is the ranking's job, and this
 * query ordering by `created_at` was the alphabetical-deletion defect.
 */
function watchlistedMovieIds(db: MediaDb): Set<number> {
  const rows = db
    .select({ mediaId: mediaWatchlist.mediaId })
    .from(mediaWatchlist)
    .where(eq(mediaWatchlist.mediaType, 'movie'))
    .all();
  return new Set(rows.map((r) => r.mediaId));
}

interface EligibilityContext {
  watchlistMovieIds: ReadonlySet<number>;
  downloadingTmdbIds: ReadonlySet<number>;
  movieSizes: MovieSizeMap;
  now: string;
}

interface EligibilityRow {
  id: number;
  tmdbId: number;
  rotationStatus: string | null;
  rotationExpiresAt: string | null;
}

function isEligible(movie: EligibilityRow, ctx: EligibilityContext): boolean {
  if (ctx.watchlistMovieIds.has(movie.id)) return false;
  if (
    movie.rotationStatus === 'protected' &&
    movie.rotationExpiresAt &&
    movie.rotationExpiresAt > ctx.now
  ) {
    return false;
  }
  if (ctx.downloadingTmdbIds.has(movie.tmdbId)) return false;
  const sizeGb = ctx.movieSizes.get(movie.tmdbId);
  return sizeGb !== undefined && sizeGb > 0;
}

export function getEligibleForRemoval(
  db: MediaDb,
  movieSizes: MovieSizeMap,
  downloadingTmdbIds: ReadonlySet<number>
): EligibleMovie[] {
  const ctx: EligibilityContext = {
    watchlistMovieIds: watchlistedMovieIds(db),
    downloadingTmdbIds,
    movieSizes,
    now: new Date().toISOString(),
  };

  return db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      voteAverage: movies.voteAverage,
      voteCount: movies.voteCount,
      rotationStatus: movies.rotationStatus,
      rotationExpiresAt: movies.rotationExpiresAt,
      watchCount: sql<number>`(
        SELECT count(*) FROM ${watchHistory}
        WHERE ${watchHistory.mediaType} = 'movie'
          AND ${watchHistory.mediaId} = ${movies.id}
          AND ${watchHistory.completed} = 1 AND ${watchHistory.blacklisted} = 0
      )`,
      lastWatchedAt: sql<string | null>`(
        SELECT max(${watchHistory.watchedAt}) FROM ${watchHistory}
        WHERE ${watchHistory.mediaType} = 'movie'
          AND ${watchHistory.mediaId} = ${movies.id}
          AND ${watchHistory.completed} = 1 AND ${watchHistory.blacklisted} = 0
      )`,
      elo: sql<number | null>`(
        SELECT avg(${mediaScores.score}) FROM ${mediaScores}
        WHERE ${mediaScores.mediaType} = 'movie'
          AND ${mediaScores.mediaId} = ${movies.id} AND ${mediaScores.comparisonCount} > 0
      )`,
      eloComparisons: sql<number>`coalesce((
        SELECT sum(${mediaScores.comparisonCount}) FROM ${mediaScores}
        WHERE ${mediaScores.mediaType} = 'movie' AND ${mediaScores.mediaId} = ${movies.id}
      ), 0)`,
    })
    .from(movies)
    .where(ne(sql`coalesce(${movies.rotationStatus}, '')`, sql`'leaving'`))
    .all()
    .filter((movie) => isEligible(movie, ctx))
    .map(({ rotationStatus: _status, rotationExpiresAt: _expiry, ...movie }) => movie);
}

/** Total size in GB of movies currently in the `leaving` state. */
export function getLeavingMovieSizeGb(db: MediaDb, movieSizes: MovieSizeMap): number {
  const leaving = db
    .select({ tmdbId: movies.tmdbId })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .all();
  let total = 0;
  for (const m of leaving) total += movieSizes.get(m.tmdbId) ?? 0;
  return total;
}

/** Mark the given movie ids as `leaving` with the supplied expiry timestamp. */
export function markMoviesAsLeaving(db: MediaDb, movieIds: number[], expiresAt: string): void {
  if (movieIds.length === 0) return;
  db.update(movies)
    .set({
      rotationStatus: 'leaving',
      rotationExpiresAt: expiresAt,
      rotationMarkedAt: new Date().toISOString(),
    })
    .where(inArray(movies.id, movieIds))
    .run();
}

/** `leaving` movies whose `rotation_expires_at` is in the past. */
export function getExpiredLeavingMovies(db: MediaDb): ExpiredMovie[] {
  const now = new Date().toISOString();
  return db
    .select({ id: movies.id, tmdbId: movies.tmdbId, title: movies.title })
    .from(movies)
    .where(and(eq(movies.rotationStatus, 'leaving'), sql`${movies.rotationExpiresAt} <= ${now}`))
    .all();
}

/** `leaving` movies sorted by expiry (soonest first) for the UI. */
export function getLeavingMovies(db: MediaDb): LeavingMovie[] {
  return db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      posterPath: movies.posterPath,
      rotationExpiresAt: movies.rotationExpiresAt,
      rotationMarkedAt: movies.rotationMarkedAt,
    })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .orderBy(asc(movies.rotationExpiresAt))
    .all();
}

/** Clear all rotation fields on a movie by id (post-removal / cancel). */
export function clearRotationStatus(db: MediaDb, id: number): void {
  db.update(movies)
    .set({ rotationStatus: null, rotationExpiresAt: null, rotationMarkedAt: null })
    .where(eq(movies.id, id))
    .run();
}

/**
 * Clear `leaving` status for a movie. Returns `true` when the movie existed and
 * was actually in the `leaving` state, `false` otherwise.
 *
 * Pass `reprieveUntil` to convert the cancel into a protection expiring at that
 * timestamp instead of simply clearing the flags. Without one the movie returns
 * to the eligible set at exactly the rank it held, so the next cycle with the
 * same deficit marks it again and the operator's decision survives until 03:00.
 * The watchlist path deliberately passes nothing: a watchlisted movie is
 * already a hard exclusion in {@link getEligibleForRemoval}, so a reprieve on
 * top would only add an expiry that outlives the reason for it.
 */
export function cancelLeaving(db: MediaDb, movieId: number, reprieveUntil?: string): boolean {
  const movie = db
    .select({ id: movies.id, rotationStatus: movies.rotationStatus })
    .from(movies)
    .where(eq(movies.id, movieId))
    .get();
  if (!movie || movie.rotationStatus !== 'leaving') return false;
  if (reprieveUntil === undefined) {
    clearRotationStatus(db, movieId);
    return true;
  }
  db.update(movies)
    .set({
      rotationStatus: 'protected',
      rotationExpiresAt: reprieveUntil,
      rotationMarkedAt: new Date().toISOString(),
    })
    .where(eq(movies.id, movieId))
    .run();
  return true;
}
