/**
 * MediaCard component stories
 * Demonstrates movie, TV show, long title, no poster, badge toggle, and fallback variants
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { MediaCard } from "./MediaCard";

const meta: Meta<typeof MediaCard> = {
  component: MediaCard,
  title: "Media/MediaCard",
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  argTypes: {
    type: {
      control: "select",
      options: ["movie", "tv"],
      description: "Media type badge",
    },
    year: {
      control: "text",
      description: "Release year or first air year",
    },
    posterUrl: {
      control: "text",
      description: "Primary poster image URL",
    },
    fallbackPosterUrl: {
      control: "text",
      description: "Fallback poster URL (tried when posterUrl fails)",
    },
    showTypeBadge: {
      control: "boolean",
      description: "Whether to show the type badge",
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: "180px" }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MediaCard>;

export const Movie: Story = {
  args: {
    id: 1,
    type: "movie",
    title: "The Shawshank Redemption",
    year: "1994",
    posterUrl: "/media/images/movie/1/poster.jpg",
  },
};

export const TvShow: Story = {
  args: {
    id: 2,
    type: "tv",
    title: "Breaking Bad",
    year: "2008",
    posterUrl: "/media/images/tv/81189/poster.jpg",
    progress: 65,
  },
};

export const LongTitle: Story = {
  args: {
    id: 3,
    type: "movie",
    title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
    year: "1964",
    posterUrl: "/media/images/movie/3/poster.jpg",
  },
};

export const NoPoster: Story = {
  args: {
    id: 4,
    type: "tv",
    title: "Upcoming Show",
    year: "2026",
    posterUrl: null,
  },
};

export const HiddenBadge: Story = {
  args: {
    id: 5,
    type: "movie",
    title: "Interstellar",
    year: "2014",
    posterUrl: "/media/images/movie/5/poster.jpg",
    showTypeBadge: false,
  },
};

export const WithFallback: Story = {
  args: {
    id: 6,
    type: "movie",
    title: "Movie With Fallback",
    year: "2025",
    posterUrl: "/nonexistent-override.jpg",
    fallbackPosterUrl: "/media/images/movie/6/poster.jpg",
  },
};

export const CompletedTvShow: Story = {
  args: {
    id: 7,
    type: "tv",
    title: "Severance",
    year: "2022",
    posterUrl: "/media/images/tv/7/poster.jpg",
    progress: 100,
  },
};
