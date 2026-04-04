import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockDimensionsQuery = vi.fn();
const mockMoviesQuery = vi.fn();
const mockRefetchMovies = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      comparisons: {
        listDimensions: {
          useQuery: (...args: unknown[]) => mockDimensionsQuery(...args),
        },
        getTierListMovies: {
          useQuery: (...args: unknown[]) => {
            const result = mockMoviesQuery(...args);
            return { ...result, refetch: mockRefetchMovies, isFetching: false };
          },
        },
      },
    },
    useUtils: () => ({}),
  },
}));

import { TierListPage } from "./TierListPage";

const DIMENSIONS = [
  { id: 1, name: "Overall", active: true, sortOrder: 1 },
  { id: 2, name: "Cinematography", active: true, sortOrder: 2 },
  { id: 3, name: "Inactive Dim", active: false, sortOrder: 3 },
];

const MOVIES = [
  { id: 10, title: "The Matrix", posterUrl: "https://img/matrix.jpg" },
  { id: 20, title: "Inception", posterUrl: "https://img/inception.jpg" },
  { id: 30, title: "Interstellar", posterUrl: null },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <TierListPage />
    </MemoryRouter>
  );
}

function setupDefaults() {
  mockDimensionsQuery.mockReturnValue({
    data: { data: DIMENSIONS },
    isLoading: false,
  });
  mockMoviesQuery.mockReturnValue({
    data: { data: MOVIES },
    isLoading: false,
  });
}

describe("TierListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it("renders dimension chips for active dimensions only", () => {
    renderPage();
    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.getByText("Cinematography")).toBeInTheDocument();
    expect(screen.queryByText("Inactive Dim")).not.toBeInTheDocument();
  });

  it("auto-selects first active dimension", () => {
    renderPage();
    const overallTab = screen.getByText("Overall");
    expect(overallTab.getAttribute("aria-selected")).toBe("true");
  });

  it("switches dimension on chip click and reloads movies", () => {
    renderPage();
    fireEvent.click(screen.getByText("Cinematography"));
    const cinematographyTab = screen.getByText("Cinematography");
    expect(cinematographyTab.getAttribute("aria-selected")).toBe("true");
    expect(mockMoviesQuery).toHaveBeenCalledWith(
      { dimensionId: 2 },
      expect.objectContaining({ enabled: true })
    );
  });

  it("calls refetch when refresh button is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Refresh"));
    expect(mockRefetchMovies).toHaveBeenCalled();
  });

  it("shows loading skeletons when movies are loading", () => {
    mockMoviesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll(".aspect-\\[2\\/3\\]");
    expect(skeletons.length).toBe(8);
  });

  it("shows empty state when no movies available", () => {
    mockMoviesQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("No movies available for this dimension.")).toBeInTheDocument();
  });

  it("renders movie cards with posters and titles", () => {
    renderPage();
    expect(screen.getByText("The Matrix")).toBeInTheDocument();
    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.getByText("Interstellar")).toBeInTheDocument();
    expect(screen.getByAltText("The Matrix poster")).toBeInTheDocument();
    expect(screen.getByAltText("Inception poster")).toBeInTheDocument();
  });

  it("shows placeholder for movies without poster", () => {
    renderPage();
    expect(screen.queryByAltText("Interstellar poster")).not.toBeInTheDocument();
  });

  it("shows dimension loading skeletons", () => {
    mockDimensionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    mockMoviesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll(".rounded-full");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows no dimensions message when none configured", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("No dimensions configured yet.")).toBeInTheDocument();
  });
});
