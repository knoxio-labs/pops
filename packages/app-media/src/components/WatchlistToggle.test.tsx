import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchlistToggle } from "./WatchlistToggle";

// Capture mutation options so we can call onMutate/onError/onSettled directly
let addMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let removeMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
const mockAddMutate = vi.fn();
const mockRemoveMutate = vi.fn();
const mockStatusInvalidate = vi.fn();
const mockListInvalidate = vi.fn();
const mockStatusCancel = vi.fn().mockResolvedValue(undefined);
const mockGetData = vi.fn();
const mockSetData = vi.fn();

const mockStatusQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      watchlist: {
        status: {
          useQuery: (...args: unknown[]) => mockStatusQuery(...args),
        },
        add: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            addMutationOpts = opts;
            return { mutate: mockAddMutate, isPending: false };
          },
        },
        remove: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            removeMutationOpts = opts;
            return { mutate: mockRemoveMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        watchlist: {
          status: {
            invalidate: mockStatusInvalidate,
            cancel: mockStatusCancel,
            getData: mockGetData,
            setData: mockSetData,
          },
          list: {
            invalidate: mockListInvalidate,
          },
        },
      },
    }),
  },
}));

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

function setupNotOnWatchlist() {
  mockStatusQuery.mockReturnValue({
    data: { isOnWatchlist: false, entryId: null },
    isLoading: false,
  });
}

function setupOnWatchlist() {
  mockStatusQuery.mockReturnValue({
    data: { isOnWatchlist: true, entryId: 42 },
    isLoading: false,
  });
}

function setupLoading() {
  mockStatusQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  addMutationOpts = {};
  removeMutationOpts = {};
});

describe("WatchlistToggle", () => {
  describe("initial state", () => {
    it("shows loading button while checking watchlist", () => {
      setupLoading();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByLabelText("Checking watchlist status")).toBeInTheDocument();
    });

    it("shows 'Add to Watchlist' when not on watchlist", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByText("Add to Watchlist")).toBeInTheDocument();
      expect(screen.getByLabelText("Add to watchlist")).toBeInTheDocument();
    });

    it("shows 'On Watchlist' when on watchlist", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByText("On Watchlist")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove from watchlist")).toBeInTheDocument();
    });

    it("calls status query with correct mediaType and mediaId", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(mockStatusQuery).toHaveBeenCalledWith(
        { mediaType: "movie", mediaId: 550 },
        expect.any(Object)
      );
    });
  });

  describe("optimistic add", () => {
    it("calls addMutation.mutate on click when not on watchlist", async () => {
      setupNotOnWatchlist();
      const user = userEvent.setup();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      await user.click(screen.getByRole("button", { name: "Add to watchlist" }));

      expect(mockAddMutate).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 550 });
    });

    it("onMutate cancels query, snapshots status, and sets optimistic state", async () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousStatus = { isOnWatchlist: false, entryId: null };
      mockGetData.mockReturnValue(previousStatus);

      const context = await addMutationOpts.onMutate!();

      expect(mockStatusCancel).toHaveBeenCalled();
      expect(mockSetData).toHaveBeenCalledWith(
        { mediaType: "movie", mediaId: 550 },
        { isOnWatchlist: true, entryId: -1 }
      );
      expect(context).toEqual({ previous: previousStatus });
    });

    it("onSuccess shows success toast", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith("Added to watchlist");
    });

    it("onError rolls back status and shows error toast", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { isOnWatchlist: false, entryId: null };
      addMutationOpts.onError!({ message: "Server error", data: null }, {}, { previous });

      expect(mockSetData).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 550 }, previous);
      expect(mockToastError).toHaveBeenCalledWith("Failed to add: Server error");
    });

    it("onError shows info toast for CONFLICT (duplicate)", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onError!(
        { message: "Conflict", data: { code: "CONFLICT" } },
        {},
        { previous: { isOnWatchlist: false, entryId: null } }
      );

      expect(mockToastInfo).toHaveBeenCalledWith("Already on watchlist");
    });

    it("onSettled invalidates status and list queries", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSettled!();

      expect(mockStatusInvalidate).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 550 });
      expect(mockListInvalidate).toHaveBeenCalled();
    });
  });

  describe("optimistic remove", () => {
    it("calls removeMutation.mutate with entryId on click when on watchlist", async () => {
      setupOnWatchlist();
      const user = userEvent.setup();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      await user.click(screen.getByRole("button", { name: "Remove from watchlist" }));

      expect(mockRemoveMutate).toHaveBeenCalledWith({ id: 42 });
    });

    it("onMutate cancels query, snapshots status, and sets optimistic removed state", async () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousStatus = { isOnWatchlist: true, entryId: 42 };
      mockGetData.mockReturnValue(previousStatus);

      const context = await removeMutationOpts.onMutate!();

      expect(mockStatusCancel).toHaveBeenCalled();
      expect(mockSetData).toHaveBeenCalledWith(
        { mediaType: "movie", mediaId: 550 },
        { isOnWatchlist: false, entryId: null }
      );
      expect(context).toEqual({ previous: previousStatus });
    });

    it("onSuccess shows success toast", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith("Removed from watchlist");
    });

    it("onError rolls back status and shows error toast", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { isOnWatchlist: true, entryId: 42 };
      removeMutationOpts.onError!({ message: "Network error" }, {}, { previous });

      expect(mockSetData).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 550 }, previous);
      expect(mockToastError).toHaveBeenCalledWith("Failed to remove: Network error");
    });

    it("onSettled invalidates status and list queries", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSettled!();

      expect(mockStatusInvalidate).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 550 });
      expect(mockListInvalidate).toHaveBeenCalled();
    });
  });

  describe("media type conversion", () => {
    it("converts 'tv' to 'tv_show' for API calls", () => {
      mockStatusQuery.mockReturnValue({
        data: { isOnWatchlist: false, entryId: null },
        isLoading: false,
      });
      render(<WatchlistToggle mediaType="tv" mediaId={100} />);

      expect(mockStatusQuery).toHaveBeenCalledWith(
        { mediaType: "tv_show", mediaId: 100 },
        expect.any(Object)
      );
    });
  });
});
