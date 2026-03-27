import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockTrendingQuery = vi.fn();
const mockRecommendationsQuery = vi.fn();
const mockAddMovieMutateAsync = vi.fn();
const mockAddWatchlistMutateAsync = vi.fn();
const mockTrendingRefetch = vi.fn();
const mockRecommendationsRefetch = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      discovery: {
        trending: {
          useQuery: (...args: unknown[]) => {
            const result = mockTrendingQuery(...args);
            return { ...result, refetch: mockTrendingRefetch, isFetching: false };
          },
        },
        recommendations: {
          useQuery: (...args: unknown[]) => {
            const result = mockRecommendationsQuery(...args);
            return { ...result, refetch: mockRecommendationsRefetch };
          },
        },
      },
      library: {
        addMovie: {
          useMutation: () => ({ mutateAsync: mockAddMovieMutateAsync }),
        },
      },
      watchlist: {
        add: {
          useMutation: () => ({ mutateAsync: mockAddWatchlistMutateAsync }),
        },
        list: { invalidate: vi.fn() },
      },
    },
    useUtils: () => ({
      media: {
        discovery: {
          trending: { invalidate: vi.fn() },
          recommendations: { invalidate: vi.fn() },
        },
        watchlist: { list: { invalidate: vi.fn() } },
      },
    }),
  },
}));

vi.mock("../components/HorizontalScrollRow", () => ({
  HorizontalScrollRow: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock("../components/DiscoverCard", () => ({
  DiscoverCard: ({
    title,
    inLibrary,
    onAddToLibrary,
    tmdbId,
  }: {
    title: string;
    inLibrary: boolean;
    onAddToLibrary?: (id: number) => void;
    tmdbId: number;
  }) => (
    <div data-testid={`card-${tmdbId}`}>
      <span>{title}</span>
      {inLibrary && <span>Owned</span>}
      {!inLibrary && onAddToLibrary && (
        <button onClick={() => onAddToLibrary(tmdbId)}>Add to Library</button>
      )}
    </div>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { DiscoverPage } from "./DiscoverPage";

const trendingMovies = [
  { tmdbId: 100, title: "Dune", releaseDate: "2024-03-01", posterPath: null, posterUrl: null, voteAverage: 8.1, inLibrary: false },
  { tmdbId: 200, title: "Oppenheimer", releaseDate: "2023-07-21", posterPath: null, posterUrl: null, voteAverage: 8.5, inLibrary: true },
  { tmdbId: 300, title: "Barbie", releaseDate: "2023-07-21", posterPath: null, posterUrl: null, voteAverage: 7.0, inLibrary: false },
];

const emptyRecommendations = {
  data: { results: [], sourceMovies: [] },
  isLoading: false,
  error: null,
};

function setupDefaults() {
  mockTrendingQuery.mockReturnValue({
    data: { results: trendingMovies, totalResults: 3, page: 1 },
    isLoading: false,
    error: null,
  });
  mockRecommendationsQuery.mockReturnValue(emptyRecommendations);
}

function renderPage(initialEntry = "/media/discover") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DiscoverPage />
    </MemoryRouter>,
  );
}

describe("DiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trending movies in grid", () => {
    setupDefaults();
    renderPage();

    expect(screen.getByText("Dune")).toBeTruthy();
    expect(screen.getByText("Oppenheimer")).toBeTruthy();
    expect(screen.getByText("Barbie")).toBeTruthy();
  });

  it("day/week toggle switches query timeWindow", () => {
    setupDefaults();
    renderPage();

    // Default is "week"
    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "week" }),
      expect.anything(),
    );

    fireEvent.click(screen.getByText("Today"));

    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "day" }),
      expect.anything(),
    );
  });

  it("active toggle button is highlighted", () => {
    setupDefaults();
    renderPage();

    const weekBtn = screen.getByText("This Week");
    const todayBtn = screen.getByText("Today");

    // Week is default — should have primary styles
    expect(weekBtn.className).toContain("bg-primary");
    expect(todayBtn.className).toContain("bg-muted");

    fireEvent.click(todayBtn);

    expect(todayBtn.className).toContain("bg-primary");
    expect(weekBtn.className).toContain("bg-muted");
  });

  it("calls add to library mutation with tmdbId", () => {
    setupDefaults();
    mockAddMovieMutateAsync.mockResolvedValue({
      created: true,
      data: { id: 1, title: "Dune" },
    });
    renderPage();

    fireEvent.click(screen.getAllByText("Add to Library")[0]!);

    expect(mockAddMovieMutateAsync).toHaveBeenCalledWith({ tmdbId: 100 });
  });

  it("shows Owned badge for movies already in library", () => {
    setupDefaults();
    renderPage();

    // Oppenheimer (tmdbId 200) is inLibrary
    const card = screen.getByTestId("card-200");
    expect(card.textContent).toContain("Owned");
  });

  it("shows error state with retry button", () => {
    mockTrendingQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "TMDB API error" },
    });
    mockRecommendationsQuery.mockReturnValue(emptyRecommendations);
    renderPage();

    expect(screen.getByText("TMDB API error")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(mockTrendingRefetch).toHaveBeenCalled();
  });

  it("shows Load More button when more results available", () => {
    mockTrendingQuery.mockReturnValue({
      data: { results: trendingMovies, totalResults: 60, page: 1 },
      isLoading: false,
      error: null,
    });
    mockRecommendationsQuery.mockReturnValue(emptyRecommendations);
    renderPage();

    expect(screen.getByText("Load More")).toBeTruthy();
  });

  it("reads time window from URL query param", () => {
    setupDefaults();
    renderPage("/media/discover?window=day");

    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "day" }),
      expect.anything(),
    );
  });
});
