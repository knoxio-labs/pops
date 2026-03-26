import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MediaCard } from "./MediaCard";

function renderCard(props: Partial<React.ComponentProps<typeof MediaCard>> = {}) {
  const defaultProps = {
    id: 1,
    type: "movie" as const,
    title: "Test Movie",
    year: 2024,
    posterUrl: "/poster.jpg",
    ...props,
  };
  return render(
    <MemoryRouter>
      <MediaCard {...defaultProps} />
    </MemoryRouter>
  );
}

describe("MediaCard", () => {
  describe("rendering", () => {
    it("renders title and year", () => {
      renderCard({ title: "Interstellar", year: 2014 });
      expect(screen.getByText("Interstellar")).toBeInTheDocument();
      expect(screen.getByText("2014")).toBeInTheDocument();
    });

    it("renders string year (extracts first 4 chars)", () => {
      renderCard({ year: "2014-11-07" });
      expect(screen.getByText("2014")).toBeInTheDocument();
    });

    it("does not render year when null", () => {
      renderCard({ year: null });
      expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument();
    });

    it("renders with correct aria-label", () => {
      renderCard({ title: "Inception", type: "movie" });
      expect(screen.getByLabelText("Inception (Movie)")).toBeInTheDocument();
    });

    it("renders TV aria-label", () => {
      renderCard({ title: "Severance", type: "tv" });
      expect(screen.getByLabelText("Severance (TV)")).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("links to movie detail page", () => {
      renderCard({ id: 42, type: "movie" });
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/media/movies/42");
    });

    it("links to TV detail page", () => {
      renderCard({ id: 99, type: "tv" });
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/media/tv/99");
    });
  });

  describe("type badge", () => {
    it("shows badge by default", () => {
      renderCard({ type: "movie" });
      expect(screen.getByText("Movie")).toBeInTheDocument();
    });

    it("shows TV badge for tv type", () => {
      renderCard({ type: "tv" });
      expect(screen.getByText("TV")).toBeInTheDocument();
    });

    it("hides badge when showTypeBadge is false", () => {
      renderCard({ type: "movie", showTypeBadge: false });
      expect(screen.queryByText("Movie")).not.toBeInTheDocument();
    });
  });

  describe("image fallback tiers", () => {
    it("renders poster image when posterUrl is provided", () => {
      renderCard({ posterUrl: "/poster.jpg" });
      const img = screen.getByAltText("Test Movie poster");
      expect(img).toHaveAttribute("src", "/poster.jpg");
    });

    it("shows placeholder when no URLs provided", () => {
      renderCard({ posterUrl: null, fallbackPosterUrl: null });
      // Placeholder is the Film icon container — no img element
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("falls back to fallbackPosterUrl on primary image error", () => {
      renderCard({
        posterUrl: "/override.jpg",
        fallbackPosterUrl: "/cached-poster.jpg",
      });
      const img = screen.getByAltText("Test Movie poster");
      expect(img).toHaveAttribute("src", "/override.jpg");

      // Simulate image load error
      fireEvent.error(img);

      // Should now try the fallback URL
      const fallbackImg = screen.getByAltText("Test Movie poster");
      expect(fallbackImg).toHaveAttribute("src", "/cached-poster.jpg");
    });

    it("shows placeholder when both tiers fail", () => {
      renderCard({
        posterUrl: "/override.jpg",
        fallbackPosterUrl: "/cached-poster.jpg",
      });
      const img = screen.getByAltText("Test Movie poster");

      // Tier 1 fails
      fireEvent.error(img);
      // Tier 2 fails
      const fallbackImg = screen.getByAltText("Test Movie poster");
      fireEvent.error(fallbackImg);

      // Should show placeholder (no img element)
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows placeholder when posterUrl fails and no fallback", () => {
      renderCard({ posterUrl: "/broken.jpg", fallbackPosterUrl: null });
      const img = screen.getByAltText("Test Movie poster");

      fireEvent.error(img);

      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });
  });

  describe("progress bar", () => {
    it("does not render progress bar when progress is null", () => {
      const { container } = renderCard({ progress: null });
      expect(container.querySelector("[style*='width']")).not.toBeInTheDocument();
    });

    it("does not render progress bar when progress is 0", () => {
      const { container } = renderCard({ progress: 0 });
      expect(container.querySelector("[style*='width']")).not.toBeInTheDocument();
    });

    it("renders progress bar with correct width", () => {
      const { container } = renderCard({ progress: 65 });
      const bar = container.querySelector("[style*='width']");
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveStyle({ width: "65%" });
    });

    it("caps progress at 100%", () => {
      const { container } = renderCard({ progress: 120 });
      const bar = container.querySelector("[style*='width']");
      expect(bar).toHaveStyle({ width: "100%" });
    });

    it("uses green color for completed shows", () => {
      const { container } = renderCard({ progress: 100 });
      const bar = container.querySelector("[style*='width']");
      expect(bar?.className).toContain("bg-green-500");
    });

    it("uses primary color for in-progress shows", () => {
      const { container } = renderCard({ progress: 50 });
      const bar = container.querySelector("[style*='width']");
      expect(bar?.className).toContain("bg-primary");
    });
  });
});
