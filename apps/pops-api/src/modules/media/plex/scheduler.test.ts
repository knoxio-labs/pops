/**
 * Tests for Plex sync scheduler — periodic polling and lifecycle management.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock dependencies
vi.mock("./service.js", () => ({
  getPlexClient: vi.fn(),
  getPlexSectionIds: vi.fn().mockReturnValue({ movieSectionId: null, tvSectionId: null }),
}));

vi.mock("./sync-movies.js", () => ({
  importMoviesFromPlex: vi.fn(),
}));

vi.mock("./sync-tv.js", () => ({
  importTvShowsFromPlex: vi.fn(),
}));

const mockRun = vi.fn();
const mockGet = vi.fn();
const mockDbValues = vi.fn().mockReturnValue({
  onConflictDoUpdate: vi.fn().mockReturnValue({ run: mockRun }),
  onConflictDoNothing: vi.fn().mockReturnValue({ run: mockRun }),
});
const mockInsert = vi.fn().mockReturnValue({ values: mockDbValues });
const mockDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: mockGet,
      }),
    }),
  }),
  insert: mockInsert,
};

vi.mock("../../../db.js", () => ({
  getDrizzle: vi.fn(() => mockDb),
}));

vi.mock("@pops/db-types", () => ({
  settings: { key: "key", value: "value" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
}));

import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  _resetScheduler,
  _triggerSync,
  getPersistedSchedulerState,
  getPersistedSyncResult,
} from "./scheduler.js";
import { getPlexClient, getPlexSectionIds } from "./service.js";
import { importMoviesFromPlex } from "./sync-movies.js";
import { importTvShowsFromPlex } from "./sync-tv.js";
import type { PlexClient } from "./client.js";

const mockGetPlexClient = vi.mocked(getPlexClient);
const mockGetPlexSectionIds = vi.mocked(getPlexSectionIds);
const mockImportMovies = vi.mocked(importMoviesFromPlex);
const mockImportTvShows = vi.mocked(importTvShowsFromPlex);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  _resetScheduler();
});

afterEach(() => {
  _resetScheduler();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startScheduler", () => {
  it("returns running status", () => {
    const status = startScheduler({ intervalMs: 5000 });

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
    expect(status.nextSyncAt).not.toBeNull();
  });

  it("uses default interval when not specified", () => {
    const status = startScheduler();

    expect(status.intervalMs).toBe(60 * 60 * 1000);
    expect(status.isRunning).toBe(true);
  });

  it("is a no-op when already running", () => {
    startScheduler({ intervalMs: 5000 });
    const status = startScheduler({ intervalMs: 10000 });

    // Should keep original interval
    expect(status.intervalMs).toBe(5000);
  });
});

describe("stopScheduler", () => {
  it("stops a running scheduler", () => {
    startScheduler({ intervalMs: 5000 });
    const status = stopScheduler();

    expect(status.isRunning).toBe(false);
    expect(status.nextSyncAt).toBeNull();
  });

  it("is a no-op when not running", () => {
    const status = stopScheduler();
    expect(status.isRunning).toBe(false);
  });
});

describe("getSchedulerStatus", () => {
  it("returns initial state", () => {
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(false);
    expect(status.lastSyncAt).toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.nextSyncAt).toBeNull();
    expect(status.moviesSynced).toBe(0);
    expect(status.tvShowsSynced).toBe(0);
  });

  it("reflects running state after start", () => {
    startScheduler({ intervalMs: 5000 });
    const status = getSchedulerStatus();

    expect(status.isRunning).toBe(true);
    expect(status.intervalMs).toBe(5000);
  });
});

describe("sync execution", () => {
  it("runs sync on interval tick", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockResolvedValue({
      total: 5,
      processed: 5,
      synced: 3,
      skipped: 2,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 1,
      skipped: 1,
      episodesMatched: 5,
      errors: [],
    });

    startScheduler({ intervalMs: 5000 });

    // Advance past interval
    vi.advanceTimersByTime(5000);
    // Let promises settle
    await vi.advanceTimersByTimeAsync(0);

    const status = getSchedulerStatus();
    expect(status.lastSyncAt).not.toBeNull();
    expect(status.lastSyncError).toBeNull();
    expect(status.moviesSynced).toBe(3);
    expect(status.tvShowsSynced).toBe(1);
    expect(mockImportMovies).toHaveBeenCalledWith(mockClient, "1");
    expect(mockImportTvShows).toHaveBeenCalledWith(mockClient, "2");
  });

  it("records error when Plex is not configured", async () => {
    mockGetPlexClient.mockReturnValue(null);

    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncError).toContain("Plex not configured");
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("records error when sync throws", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockRejectedValue(new Error("Network timeout"));

    startScheduler({ intervalMs: 5000, movieSectionId: "1", tvSectionId: "2" });
    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncError).toContain("Network timeout");
    expect(status.lastSyncAt).not.toBeNull();
  });

  it("continues running after sync error", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockRejectedValue(new Error("Plex down"));

    startScheduler({ intervalMs: 5000, movieSectionId: "1", tvSectionId: "2" });

    // First tick — error
    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSchedulerStatus().isRunning).toBe(true);
    expect(getSchedulerStatus().lastSyncError).toContain("Plex down");

    // Second tick — success
    mockImportMovies.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSchedulerStatus().isRunning).toBe(true);
    expect(getSchedulerStatus().lastSyncError).toBeNull();
    expect(getSchedulerStatus().moviesSynced).toBe(1);
  });

  it("accumulates sync counts across multiple cycles", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 2,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      episodesMatched: 3,
      errors: [],
    });

    startScheduler({ intervalMs: 1000, movieSectionId: "1", tvSectionId: "2" });

    // Run 3 cycles
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      await vi.advanceTimersByTimeAsync(0);
    }

    const status = getSchedulerStatus();
    expect(status.moviesSynced).toBe(6);
    expect(status.tvShowsSynced).toBe(3);
  });

  it("uses custom section IDs", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockImportMovies.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    startScheduler({
      intervalMs: 1000,
      movieSectionId: "3",
      tvSectionId: "4",
    });

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockImportMovies).toHaveBeenCalledWith(mockClient, "3");
    expect(mockImportTvShows).toHaveBeenCalledWith(mockClient, "4");
  });

  it("does not sync after stop", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    startScheduler({ intervalMs: 5000, movieSectionId: "1", tvSectionId: "2" });
    stopScheduler();

    vi.advanceTimersByTime(10000);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockImportMovies).not.toHaveBeenCalled();
    expect(mockImportTvShows).not.toHaveBeenCalled();
  });
});

describe("_triggerSync", () => {
  it("runs a sync cycle immediately", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockResolvedValue({
      total: 1,
      processed: 1,
      synced: 1,
      skipped: 0,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [],
    });

    startScheduler({ intervalMs: 60000, movieSectionId: "1", tvSectionId: "2" });
    await _triggerSync();

    expect(mockImportMovies).toHaveBeenCalledOnce();
    expect(mockImportTvShows).toHaveBeenCalledOnce();
    expect(getSchedulerStatus().lastSyncAt).not.toBeNull();
    expect(getSchedulerStatus().moviesSynced).toBe(1);
  });

  it("skips sync when section IDs are not configured", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: null, tvSectionId: null });

    startScheduler({ intervalMs: 60000 });
    await _triggerSync();

    expect(mockImportMovies).not.toHaveBeenCalled();
    expect(mockImportTvShows).not.toHaveBeenCalled();
  });
});

describe("scheduler persistence", () => {
  it("persists state when scheduler starts", () => {
    startScheduler({ intervalMs: 5000, movieSectionId: "1", tvSectionId: "2" });
    // Verify insert was called for plex_scheduler_enabled
    expect(mockInsert).toHaveBeenCalled();
  });

  it("persists disabled state when scheduler stops", () => {
    startScheduler({ intervalMs: 5000 });
    mockInsert.mockClear();
    stopScheduler();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("reads persisted state from settings", () => {
    // Mock DB to return enabled state
    mockGet.mockReturnValue({ value: "true" });
    const state = getPersistedSchedulerState();
    expect(state.enabled).toBe(true);
  });

  it("returns disabled when no persisted state", () => {
    mockGet.mockReturnValue(null);
    const state = getPersistedSchedulerState();
    expect(state.enabled).toBe(false);
  });

  it("stores sync results after a sync cycle", async () => {
    const mockClient = {} as PlexClient;
    mockGetPlexClient.mockReturnValue(mockClient);
    mockGetPlexSectionIds.mockReturnValue({ movieSectionId: "1", tvSectionId: "2" });
    mockImportMovies.mockResolvedValue({
      total: 5,
      processed: 5,
      synced: 3,
      skipped: 2,
      errors: [],
    });
    mockImportTvShows.mockResolvedValue({
      total: 2,
      processed: 2,
      synced: 1,
      skipped: 1,
      episodesMatched: 5,
      errors: [],
    });

    startScheduler({ intervalMs: 5000, movieSectionId: "1", tvSectionId: "2" });
    await _triggerSync();

    // Verify sync result was persisted
    const status = getSchedulerStatus();
    expect(status.lastSyncResult).not.toBeNull();
    expect(status.lastSyncResult!.moviesSynced).toBe(3);
    expect(status.lastSyncResult!.tvShowsSynced).toBe(1);
    expect(status.lastSyncResult!.error).toBeNull();
  });

  it("stores error in sync result when Plex not configured", async () => {
    mockGetPlexClient.mockReturnValue(null);

    await _triggerSync();

    const status = getSchedulerStatus();
    expect(status.lastSyncResult).not.toBeNull();
    expect(status.lastSyncResult!.error).toContain("Plex not configured");
  });

  it("getPersistedSyncResult reads stored result", () => {
    const fakeResult = JSON.stringify({
      moviesSynced: 5,
      moviesSkipped: 1,
      movieErrors: 0,
      tvShowsSynced: 2,
      tvShowsSkipped: 0,
      tvErrors: 0,
      timestamp: "2026-03-27T00:00:00.000Z",
      error: null,
    });
    mockGet.mockReturnValue({ value: fakeResult });
    const result = getPersistedSyncResult();
    expect(result).not.toBeNull();
    expect(result!.moviesSynced).toBe(5);
  });

  it("getPersistedSyncResult returns null when no stored result", () => {
    mockGet.mockReturnValue(null);
    const result = getPersistedSyncResult();
    expect(result).toBeNull();
  });
});
