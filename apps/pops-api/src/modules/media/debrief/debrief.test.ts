import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "better-sqlite3";
import { setupTestContext, seedMovie, seedWatchHistoryEntry } from "../../../shared/test-utils.js";
import { createDebriefSession } from "./service.js";
import * as watchHistoryService from "../watch-history/service.js";

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

function getDebriefSessions(db: Database) {
  return db.prepare("SELECT * FROM debrief_sessions ORDER BY id").all() as Array<{
    id: number;
    watch_history_id: number;
    status: string;
    created_at: string;
  }>;
}

describe("debrief auto-queue", () => {
  describe("createDebriefSession", () => {
    it("creates a pending session for a watch history entry", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const whId = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
      });

      const sessionId = createDebriefSession(whId);

      expect(sessionId).toBeGreaterThan(0);
      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.watch_history_id).toBe(whId);
      expect(sessions[0]!.status).toBe("pending");
    });

    it("re-watch deletes existing pending session and creates new one", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const wh1 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-01-01T00:00:00.000Z",
      });
      createDebriefSession(wh1);

      // Re-watch creates a new watch history entry
      const wh2 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-02-01T00:00:00.000Z",
      });
      const newSessionId = createDebriefSession(wh2);

      const sessions = getDebriefSessions(db);
      // Only the new session should remain (old pending was deleted)
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe(newSessionId);
      expect(sessions[0]!.watch_history_id).toBe(wh2);
    });

    it("preserves completed sessions on re-watch", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      const wh1 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-01-01T00:00:00.000Z",
      });
      createDebriefSession(wh1);
      // Manually mark as complete
      db.prepare("UPDATE debrief_sessions SET status = 'complete' WHERE watch_history_id = ?").run(
        wh1
      );

      // Re-watch
      const wh2 = seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        watched_at: "2026-02-01T00:00:00.000Z",
      });
      createDebriefSession(wh2);

      const sessions = getDebriefSessions(db);
      // Should have 2: the completed one from first watch + new pending
      expect(sessions).toHaveLength(2);
      expect(sessions[0]!.status).toBe("complete");
      expect(sessions[1]!.status).toBe("pending");
    });
  });

  describe("logWatch integration", () => {
    it("creates a debrief session when logging a completed watch", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });

      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 1,
      });

      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.status).toBe("pending");
    });

    it("does not create a debrief session for incomplete watches", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });

      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 0,
      });

      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(0);
    });

    it("does not create a debrief session for blacklisted watch events", () => {
      seedMovie(db, { title: "The Matrix", tmdb_id: 100 });
      // Seed a blacklisted entry at the same timestamp
      seedWatchHistoryEntry(db, {
        media_type: "movie",
        media_id: 1,
        completed: 1,
        blacklisted: 1,
        watched_at: "2026-03-01T00:00:00.000Z",
      });

      // Try to log at the same timestamp — should be blocked by blacklist check
      watchHistoryService.logWatch({
        mediaType: "movie",
        mediaId: 1,
        completed: 1,
        watchedAt: "2026-03-01T00:00:00.000Z",
      });

      const sessions = getDebriefSessions(db);
      expect(sessions).toHaveLength(0);
    });
  });
});
