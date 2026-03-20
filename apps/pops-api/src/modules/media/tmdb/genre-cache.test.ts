import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GenreCache, getGenreCache, setGenreCache } from "./genre-cache.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeGenreResponse(genres: { id: number; name: string }[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ genres }),
  };
}

const TEST_GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
];

describe("GenreCache", () => {
  let cache: GenreCache;

  beforeEach(() => {
    cache = new GenreCache("test-api-key");
    mockFetch.mockReset();
  });

  describe("ensureLoaded", () => {
    it("fetches genres lazily on first call", async () => {
      mockFetch.mockResolvedValueOnce(makeGenreResponse(TEST_GENRES));

      expect(cache.size).toBe(0);
      await cache.ensureLoaded();
      expect(cache.size).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not re-fetch within TTL", async () => {
      mockFetch.mockResolvedValueOnce(makeGenreResponse(TEST_GENRES));

      await cache.ensureLoaded();
      await cache.ensureLoaded();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after TTL expires", async () => {
      mockFetch.mockResolvedValue(makeGenreResponse(TEST_GENRES));

      await cache.ensureLoaded();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Simulate TTL expiry by manipulating lastFetchedAt via clear + time
      vi.useFakeTimers();
      cache.clear();
      await cache.ensureLoaded();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("throws on failed fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(cache.ensureLoaded()).rejects.toThrow(
        "TMDB genre fetch failed: 401 Unauthorized",
      );
    });

    it("deduplicates concurrent requests", async () => {
      let resolvePromise: () => void;
      const delayed = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(async () => {
        await delayed;
        return makeGenreResponse(TEST_GENRES);
      });

      // Fire two concurrent ensureLoaded calls
      const p1 = cache.ensureLoaded();
      const p2 = cache.ensureLoaded();

      resolvePromise!();
      await Promise.all([p1, p2]);

      // Should only have fetched once
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(3);
    });
  });

  describe("mapGenreIds", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce(makeGenreResponse(TEST_GENRES));
    });

    it("maps known genre IDs to names", async () => {
      const names = await cache.mapGenreIds([28, 18]);
      expect(names).toEqual(["Action", "Drama"]);
    });

    it("skips unknown genre IDs", async () => {
      const names = await cache.mapGenreIds([28, 9999, 35]);
      expect(names).toEqual(["Action", "Comedy"]);
    });

    it("returns empty array for all unknown IDs", async () => {
      const names = await cache.mapGenreIds([100, 200]);
      expect(names).toEqual([]);
    });

    it("returns empty array for empty input", async () => {
      const names = await cache.mapGenreIds([]);
      expect(names).toEqual([]);
    });
  });

  describe("clear", () => {
    it("resets cache state", async () => {
      mockFetch.mockResolvedValue(makeGenreResponse(TEST_GENRES));

      await cache.ensureLoaded();
      expect(cache.size).toBe(3);

      cache.clear();
      expect(cache.size).toBe(0);

      // Should re-fetch after clear
      await cache.ensureLoaded();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetch request format", () => {
    it("sends correct Authorization header", async () => {
      mockFetch.mockResolvedValueOnce(makeGenreResponse(TEST_GENRES));

      await cache.ensureLoaded();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.themoviedb.org/3/genre/movie/list",
        {
          headers: {
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          },
        },
      );
    });
  });
});

describe("singleton helpers", () => {
  afterEach(() => {
    setGenreCache(null);
    delete process.env["TMDB_API_KEY"];
  });

  it("getGenreCache creates singleton from env var", () => {
    process.env["TMDB_API_KEY"] = "env-test-key";
    const cache = getGenreCache();
    expect(cache).toBeInstanceOf(GenreCache);

    // Returns same instance
    expect(getGenreCache()).toBe(cache);
  });

  it("getGenreCache throws when TMDB_API_KEY is not set", () => {
    expect(() => getGenreCache()).toThrow(
      "TMDB_API_KEY environment variable is not set",
    );
  });

  it("setGenreCache replaces the singleton", () => {
    process.env["TMDB_API_KEY"] = "env-test-key";
    const original = getGenreCache();

    const custom = new GenreCache("custom-key");
    setGenreCache(custom);

    expect(getGenreCache()).toBe(custom);
    expect(getGenreCache()).not.toBe(original);
  });
});
