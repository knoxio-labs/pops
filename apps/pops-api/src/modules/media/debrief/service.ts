/**
 * Debrief service — auto-queue and manage post-watch debrief sessions.
 */
import { eq, and, inArray } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { debriefSessions, watchHistory } from "@pops/db-types";

/**
 * Create a pending debrief session for a watch history entry.
 * If the same media already has pending/active sessions (from a previous watch),
 * those are deleted first (re-watch resets debrief state).
 *
 * Returns the new session ID.
 */
export function createDebriefSession(watchHistoryId: number): number {
  const db = getDrizzle();

  // Look up the watch history entry to find media info
  const entry = db.select().from(watchHistory).where(eq(watchHistory.id, watchHistoryId)).get();
  if (!entry) {
    throw new Error(`Watch history entry ${watchHistoryId} not found`);
  }

  // Find and delete any existing pending/active sessions for this same media
  // (re-watch resets debrief state)
  const existingWatchIds = db
    .select({ id: watchHistory.id })
    .from(watchHistory)
    .where(
      and(eq(watchHistory.mediaType, entry.mediaType), eq(watchHistory.mediaId, entry.mediaId))
    )
    .all()
    .map((r) => r.id);

  if (existingWatchIds.length > 0) {
    db.delete(debriefSessions)
      .where(
        and(
          inArray(debriefSessions.watchHistoryId, existingWatchIds),
          inArray(debriefSessions.status, ["pending", "active"])
        )
      )
      .run();
  }

  // Create new pending session
  const result = db.insert(debriefSessions).values({ watchHistoryId, status: "pending" }).run();

  return Number(result.lastInsertRowid);
}
