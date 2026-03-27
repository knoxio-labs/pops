import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockListRecentQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      watchHistory: {
        listRecent: { useQuery: (...args: unknown[]) => mockListRecentQuery(...args) },
      },
    },
  },
}));

import { HistoryPage } from "./HistoryPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/media/history"]}>
      <HistoryPage />
    </MemoryRouter>
  );
}

const episodeEntry = {
  id: 1,
  mediaType: "episode",
  mediaId: 42,
  watchedAt: "2026-03-20T10:30:00Z",
  title: "Pilot",
  posterPath: "/poster.jpg",
  posterUrl: "https://img.example.com/poster.jpg",
  seasonNumber: 2,
  episodeNumber: 10,
  showName: "Breaking Bad",
  tvShowId: 7,
};

const movieEntry = {
  id: 2,
  mediaType: "movie",
  mediaId: 99,
  watchedAt: "2026-03-19T20:00:00Z",
  title: "The Matrix",
  posterPath: "/matrix.jpg",
  posterUrl: "https://img.example.com/matrix.jpg",
  seasonNumber: null,
  episodeNumber: null,
  showName: null,
  tvShowId: null,
};

const episodeNoShow = {
  id: 3,
  mediaType: "episode",
  mediaId: 55,
  watchedAt: "2026-03-18T15:00:00Z",
  title: "Mystery Episode",
  posterPath: null,
  posterUrl: null,
  seasonNumber: null,
  episodeNumber: null,
  showName: null,
  tvShowId: null,
};

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders episode subtitle in S02E10 format with em-dash", () => {
    mockListRecentQuery.mockReturnValue({
      data: { data: [episodeEntry], pagination: { total: 1 } },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getAllByText("Breaking Bad").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S02E10").length).toBeGreaterThan(0);
  });

  it("renders show name as link to show detail page", () => {
    mockListRecentQuery.mockReturnValue({
      data: { data: [episodeEntry], pagination: { total: 1 } },
      isLoading: false,
      error: null,
    });

    renderPage();

    const showLinks = screen.getAllByText("Breaking Bad");
    const showLink = showLinks.find(
      (el) => el.closest("a")?.getAttribute("href") === "/media/tv/7"
    );
    expect(showLink).toBeTruthy();
  });

  it("renders season code as link to season detail page", () => {
    mockListRecentQuery.mockReturnValue({
      data: { data: [episodeEntry], pagination: { total: 1 } },
      isLoading: false,
      error: null,
    });

    renderPage();

    const codeLinks = screen.getAllByText("S02E10");
    const seasonLink = codeLinks.find(
      (el) => el.closest("a")?.getAttribute("href") === "/media/tv/7?season=2"
    );
    expect(seasonLink).toBeTruthy();
  });

  it("renders movie entries with no subtitle", () => {
    mockListRecentQuery.mockReturnValue({
      data: { data: [movieEntry], pagination: { total: 1 } },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getAllByText("The Matrix").length).toBeGreaterThan(0);
    // No episode code or show name should appear
    expect(screen.queryByText(/S\d+E\d+/)).toBeNull();
  });

  it("renders episode with missing show data as title only (graceful fallback)", () => {
    mockListRecentQuery.mockReturnValue({
      data: { data: [episodeNoShow], pagination: { total: 1 } },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getAllByText("Mystery Episode").length).toBeGreaterThan(0);
    // No subtitle when show data is missing
    expect(screen.queryByText(/S\d+E\d+/)).toBeNull();
  });

  it("renders mixed entries correctly", () => {
    mockListRecentQuery.mockReturnValue({
      data: { data: [episodeEntry, movieEntry, episodeNoShow], pagination: { total: 3 } },
      isLoading: false,
      error: null,
    });

    renderPage();

    // Episode with full data shows subtitle
    expect(screen.getAllByText("Breaking Bad").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S02E10").length).toBeGreaterThan(0);

    // Movie has no subtitle
    expect(screen.getAllByText("The Matrix").length).toBeGreaterThan(0);

    // Episode without show data has no subtitle
    expect(screen.getAllByText("Mystery Episode").length).toBeGreaterThan(0);
  });
});
