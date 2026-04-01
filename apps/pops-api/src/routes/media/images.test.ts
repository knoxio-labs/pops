/**
 * Image serving endpoint tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { join } from "node:path";
import imagesRouter from "./images.js";

// Mock node:fs/promises
vi.mock("node:fs/promises");
import * as fs from "node:fs/promises";

// Mock database
const mockGet = vi.fn<() => { path: string | null; title: string | null } | undefined>(() => undefined);
vi.mock("../../db.js", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: mockGet,
    })),
  })),
}));

// Mock image cache
const mockDownloadMovieImages = vi.fn(async () => {});
const mockDownloadTvShowImages = vi.fn(async () => {});
const mockGeneratePlaceholder = vi.fn(async () => {});
const mockGenerateTvPlaceholder = vi.fn(async () => {});
vi.mock("../../modules/media/tmdb/index.js", () => ({
  getImageCache: vi.fn(() => ({
    downloadMovieImages: mockDownloadMovieImages,
    downloadTvShowImages: mockDownloadTvShowImages,
    generatePlaceholder: mockGeneratePlaceholder,
    generateTvPlaceholder: mockGenerateTvPlaceholder,
  })),
}));

const TEST_IMAGES_DIR = "/test/media/images";

function createTestApp() {
  const app = express();
  app.use(imagesRouter);
  return app;
}

beforeEach(() => {
  vi.stubEnv("MEDIA_IMAGES_DIR", TEST_IMAGES_DIR);
  // Default: files don't exist
  vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
  mockGet.mockReturnValue(undefined);
  mockDownloadMovieImages.mockResolvedValue(undefined);
  mockDownloadTvShowImages.mockResolvedValue(undefined);
  mockGeneratePlaceholder.mockResolvedValue(undefined);
  mockGenerateTvPlaceholder.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /media/images/:mediaType/:id/:filename", () => {
  describe("parameter validation", () => {
    it("returns 400 for invalid media type", async () => {
      const app = createTestApp();

      const res = await request(app).get("/media/images/tvshow/550/poster.jpg");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid media type");
    });

    it("returns 400 for non-numeric id", async () => {
      const app = createTestApp();

      const res = await request(app).get("/media/images/movie/abc/poster.jpg");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid id");
    });

    it("returns 400 for invalid filename", async () => {
      const app = createTestApp();

      const res = await request(app).get("/media/images/movie/550/malicious.exe");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid filename");
    });

    it("accepts all valid filenames", async () => {
      const app = createTestApp();

      for (const filename of ["poster.jpg", "backdrop.jpg", "logo.png", "override.jpg"]) {
        const res = await request(app).get(`/media/images/movie/550/${filename}`);
        // Should be 404 (file not found), not 400 (validation error)
        expect(res.status).toBe(404);
      }
    });
  });

  describe("file serving", () => {
    it("returns 404 when image does not exist", async () => {
      const app = createTestApp();

      const res = await request(app).get("/media/images/movie/550/poster.jpg");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Image not found");
    });

    it("serves file with correct headers when it exists", async () => {
      const app = createTestApp();
      const expectedPath = join(TEST_IMAGES_DIR, "movies", "550", "poster.jpg");

      // Mock stat to succeed for the poster file
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        if (path === expectedPath) {
          return { mtimeMs: 1700000000000, size: 12345 } as Awaited<ReturnType<typeof fs.stat>>;
        }
        throw new Error("ENOENT");
      });

      await request(app).get("/media/images/movie/550/poster.jpg");

      // sendFile will fail in test (no actual file) but headers are set
      // We check that stat was called with the correct path
      expect(fs.stat).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe("override resolution", () => {
    it("checks for override.jpg before poster.jpg", async () => {
      const app = createTestApp();
      const overridePath = join(TEST_IMAGES_DIR, "movies", "550", "override.jpg");
      const posterPath = join(TEST_IMAGES_DIR, "movies", "550", "poster.jpg");

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error("ENOENT");
      });

      await request(app).get("/media/images/movie/550/poster.jpg");

      // Override should be checked first
      expect(statCalls[0]).toBe(overridePath);
      // Then the actual poster
      expect(statCalls[1]).toBe(posterPath);
    });

    it("does not check override for non-poster requests", async () => {
      const app = createTestApp();
      const overridePath = join(TEST_IMAGES_DIR, "movies", "550", "override.jpg");

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error("ENOENT");
      });

      await request(app).get("/media/images/movie/550/backdrop.jpg");

      // Override should NOT be checked for backdrop
      expect(statCalls).not.toContain(overridePath);
    });
  });

  describe("tv media type", () => {
    it("accepts tv as a valid media type", async () => {
      const app = createTestApp();

      const res = await request(app).get("/media/images/tv/81189/poster.jpg");

      // Should be 404 (file not found), not 400 (validation error)
      expect(res.status).toBe(404);
    });

    it("resolves tv images under tv/ directory (not tvs/)", async () => {
      const app = createTestApp();

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error("ENOENT");
      });

      await request(app).get("/media/images/tv/81189/poster.jpg");

      // Should look in tv/ not tvs/
      expect(statCalls.some((p) => p.includes("/tv/81189/"))).toBe(true);
      expect(statCalls.some((p) => p.includes("/tvs/"))).toBe(false);
    });

    it("checks override for tv poster requests", async () => {
      const app = createTestApp();
      const overridePath = join(TEST_IMAGES_DIR, "tv", "81189", "override.jpg");

      const statCalls: string[] = [];
      vi.mocked(fs.stat).mockImplementation(async (path) => {
        statCalls.push(path as string);
        throw new Error("ENOENT");
      });

      await request(app).get("/media/images/tv/81189/poster.jpg");

      expect(statCalls[0]).toBe(overridePath);
    });
  });

  describe("on-demand download", () => {
    it("downloads movie image from TMDB on cache miss", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "/abc123.jpg", title: "Test Movie" });

      await request(app).get("/media/images/movie/550/poster.jpg");

      expect(mockDownloadMovieImages).toHaveBeenCalledWith(550, "/abc123.jpg", null, null);
    });

    it("downloads backdrop via correct parameter slot", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "/backdrop.jpg", title: "Test Movie" });

      await request(app).get("/media/images/movie/550/backdrop.jpg");

      expect(mockDownloadMovieImages).toHaveBeenCalledWith(550, null, "/backdrop.jpg", null);
    });

    it("downloads logo via correct parameter slot", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "/logo.png", title: "Test Movie" });

      await request(app).get("/media/images/movie/550/logo.png");

      expect(mockDownloadMovieImages).toHaveBeenCalledWith(550, null, null, "/logo.png");
    });

    it("downloads TV poster from TheTVDB on cache miss", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "https://artworks.thetvdb.com/poster.jpg", title: "Test Show" });

      await request(app).get("/media/images/tv/81189/poster.jpg");

      expect(mockDownloadTvShowImages).toHaveBeenCalledWith(
        81189,
        "https://artworks.thetvdb.com/poster.jpg",
        null,
        undefined,
        null
      );
    });

    it("downloads TV logo from TheTVDB on cache miss", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "https://artworks.thetvdb.com/logo.png", title: "Test Show" });

      await request(app).get("/media/images/tv/81189/logo.png");

      expect(mockDownloadTvShowImages).toHaveBeenCalledWith(
        81189,
        null,
        null,
        undefined,
        "https://artworks.thetvdb.com/logo.png"
      );
    });

    it("generates placeholder when download fails for movies", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "/abc123.jpg", title: "Test Movie" });
      mockDownloadMovieImages.mockRejectedValue(new Error("Download failed"));

      const res = await request(app).get("/media/images/movie/550/poster.jpg");

      // Download failed → placeholder generation attempted
      expect(mockGeneratePlaceholder).toHaveBeenCalledWith(550, "Test Movie");
      // Still returns 404 since the file doesn't exist (mock stat always fails)
      expect(res.status).toBe(404);
    });

    it("generates placeholder for TV when download fails", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: "https://artworks.thetvdb.com/poster.jpg", title: "Test Show" });
      mockDownloadTvShowImages.mockRejectedValue(new Error("Download failed"));

      const res = await request(app).get("/media/images/tv/81189/poster.jpg");

      expect(mockGenerateTvPlaceholder).toHaveBeenCalledWith(81189, "Test Show");
      expect(res.status).toBe(404);
    });

    it("generates placeholder when DB has no poster_path", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: null, title: "No Poster Movie" });

      const res = await request(app).get("/media/images/movie/550/poster.jpg");

      // No path → skip download → generate placeholder
      expect(mockDownloadMovieImages).not.toHaveBeenCalled();
      expect(mockGeneratePlaceholder).toHaveBeenCalledWith(550, "No Poster Movie");
      expect(res.status).toBe(404);
    });

    it("returns 404 without placeholder for non-poster images with no path", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue({ path: null, title: "Test Movie" });

      const res = await request(app).get("/media/images/movie/550/backdrop.jpg");

      // Placeholder is only generated for poster.jpg
      expect(mockGeneratePlaceholder).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it("does not attempt download when no DB record exists", async () => {
      const app = createTestApp();
      mockGet.mockReturnValue(undefined);

      const res = await request(app).get("/media/images/movie/9999/poster.jpg");

      expect(mockDownloadMovieImages).not.toHaveBeenCalled();
      expect(mockGeneratePlaceholder).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it("returns 404 immediately for override.jpg without downloading", async () => {
      const app = createTestApp();

      const res = await request(app).get("/media/images/movie/550/override.jpg");

      // override.jpg is a user upload — never downloaded on-demand
      expect(mockDownloadMovieImages).not.toHaveBeenCalled();
      expect(mockDownloadTvShowImages).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });
  });
});
