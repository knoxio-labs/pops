/**
 * TMDB genre mapping cache.
 *
 * Lazily fetches the TMDB genre list and caches it in memory.
 * Maps genre IDs (integers) to human-readable names for search results.
 * Refreshes automatically after 24 hours.
 */
import type { TmdbGenreListResponse } from "./types.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class GenreCache {
  private cache: Map<number, string> = new Map();
  private lastFetchedAt = 0;
  private inflightRequest: Promise<void> | null = null;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Ensure the cache is populated. Lazy — fetches on first call. */
  async ensureLoaded(): Promise<void> {
    if (this.cache.size > 0 && Date.now() - this.lastFetchedAt < CACHE_TTL_MS) {
      return;
    }

    // Deduplicate concurrent requests
    if (this.inflightRequest) {
      await this.inflightRequest;
      return;
    }

    this.inflightRequest = this.fetchGenres();
    try {
      await this.inflightRequest;
    } finally {
      this.inflightRequest = null;
    }
  }

  /** Map an array of TMDB genre IDs to their names. Unknown IDs are skipped. */
  async mapGenreIds(ids: number[]): Promise<string[]> {
    await this.ensureLoaded();
    return ids
      .map((id) => this.cache.get(id))
      .filter((name): name is string => name !== undefined);
  }

  /** Get the current cache size (for testing). */
  get size(): number {
    return this.cache.size;
  }

  /** Clear the cache (for testing). */
  clear(): void {
    this.cache.clear();
    this.lastFetchedAt = 0;
    this.inflightRequest = null;
  }

  private async fetchGenres(): Promise<void> {
    const url = `${TMDB_BASE_URL}/genre/movie/list`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB genre fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TmdbGenreListResponse;

    this.cache.clear();
    for (const genre of data.genres) {
      this.cache.set(genre.id, genre.name);
    }
    this.lastFetchedAt = Date.now();
  }
}

/** Singleton genre cache instance. */
let instance: GenreCache | null = null;

/** Get or create the singleton GenreCache. Uses TMDB_API_KEY from environment. */
export function getGenreCache(): GenreCache {
  if (!instance) {
    const apiKey = process.env["TMDB_API_KEY"];
    if (!apiKey) {
      throw new Error("TMDB_API_KEY environment variable is not set");
    }
    instance = new GenreCache(apiKey);
  }
  return instance;
}

/** Replace the singleton (for testing). */
export function setGenreCache(cache: GenreCache | null): void {
  instance = cache;
}
