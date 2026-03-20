/**
 * Watch history service — CRUD operations against SQLite via Drizzle ORM.
 *
 * Auto-remove: when a completed watch is logged, the corresponding
 * watchlist entry is removed automatically (movies immediately,
 * TV shows only when all episodes have been watched).
 */
import { count, desc, eq, and, inArray, type SQL } from "drizzle-orm";
import { getDrizzle, getDb } from "../../../db.js";
import { watchHistory, mediaWatchlist, episodes, seasons } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
import type {
  WatchHistoryRow,
  LogWatchInput,
  WatchHistoryFilters,
} from "./types.js";

/** Count + rows for a paginated list. */
export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

/** List watch history entries with optional filters. */
export function listWatchHistory(
  filters: WatchHistoryFilters,
  limit: number,
  offset: number
): WatchHistoryListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];

  if (filters.mediaType) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as "movie" | "episode"));
  }
  if (filters.mediaId) {
    conditions.push(eq(watchHistory.mediaId, filters.mediaId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db
    .select({ total: count() })
    .from(watchHistory)
    .where(where)
    .all();

  return { rows, total: countRow.total };
}

/** Get a single watch history entry by id. Throws NotFoundError if missing. */
export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, id))
    .get();

  if (!row) throw new NotFoundError("WatchHistoryEntry", String(id));
  return row;
}

/** Log a watch event. Auto-removes from watchlist when applicable. Returns the created row. */
export function logWatch(input: LogWatchInput): WatchHistoryRow {
  const rawDb = getDb();

  return rawDb.transaction(() => {
    const db = getDrizzle();

    const result = db
      .insert(watchHistory)
      .values({
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        watchedAt: input.watchedAt ?? new Date().toISOString(),
        completed: input.completed ?? 1,
      })
      .run();

    const row = getWatchHistoryEntry(Number(result.lastInsertRowid));

    // Auto-remove from watchlist on completed watch
    const completed = input.completed ?? 1;
    if (completed === 1) {
      if (input.mediaType === "movie") {
        autoRemoveMovie(input.mediaId);
      } else if (input.mediaType === "episode") {
        autoRemoveShowByEpisode(input.mediaId);
      }
    }

    return row;
  })();
}

/**
 * Remove a movie from the watchlist if it's on there.
 * Silently no-ops if the movie isn't on the watchlist.
 */
function autoRemoveMovie(movieId: number): void {
  const db = getDrizzle();
  db.delete(mediaWatchlist)
    .where(
      and(
        eq(mediaWatchlist.mediaType, "movie"),
        eq(mediaWatchlist.mediaId, movieId),
      ),
    )
    .run();
}

/**
 * Given an episode ID, resolve to the parent TV show and check whether
 * every episode in the show has been watched (completed=1).
 * If so, remove the show from the watchlist.
 */
function autoRemoveShowByEpisode(episodeId: number): void {
  const db = getDrizzle();

  // Resolve episode → season → tv_show_id
  const episode = db
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return;

  const season = db
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return;

  const tvShowId = season.tvShowId;

  // Check if this show is on the watchlist at all (early exit)
  const entry = db
    .select({ id: mediaWatchlist.id })
    .from(mediaWatchlist)
    .where(
      and(
        eq(mediaWatchlist.mediaType, "tv_show"),
        eq(mediaWatchlist.mediaId, tvShowId),
      ),
    )
    .get();
  if (!entry) return;

  // Get all episode IDs for this show
  const showEpisodeIds = db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);

  if (showEpisodeIds.length === 0) return;

  // Count watched episodes scoped to this show's episode IDs
  const [watchedRow] = db
    .select({ watched: count() })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, "episode"),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, showEpisodeIds),
      ),
    )
    .all();

  if (watchedRow.watched >= showEpisodeIds.length) {
    db.delete(mediaWatchlist)
      .where(eq(mediaWatchlist.id, entry.id))
      .run();
  }
}

/** Delete a watch history entry by ID. Throws NotFoundError if missing. */
export function deleteWatchHistoryEntry(id: number): void {
  getWatchHistoryEntry(id);

  const result = getDrizzle()
    .delete(watchHistory)
    .where(eq(watchHistory.id, id))
    .run();
  if (result.changes === 0) throw new NotFoundError("WatchHistoryEntry", String(id));
}
