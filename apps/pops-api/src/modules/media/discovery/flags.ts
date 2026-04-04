/**
 * Shared helpers for building Sets of watched and watchlisted TMDB IDs,
 * used to populate isWatched and onWatchlist flags on DiscoverResult objects.
 */
import { eq } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies, watchHistory, mediaWatchlist } from "@pops/db-types";

/** Build a Set of TMDB IDs the user has watched (any entry in watch_history). */
export function getWatchedTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(watchHistory)
    .innerJoin(movies, eq(movies.id, watchHistory.mediaId))
    .where(eq(watchHistory.mediaType, "movie"))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** Build a Set of TMDB IDs currently on the user's watchlist. */
export function getWatchlistTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ tmdbId: movies.tmdbId })
    .from(mediaWatchlist)
    .innerJoin(movies, eq(movies.id, mediaWatchlist.mediaId))
    .where(eq(mediaWatchlist.mediaType, "movie"))
    .all();
  return new Set(rows.map((r) => r.tmdbId));
}
