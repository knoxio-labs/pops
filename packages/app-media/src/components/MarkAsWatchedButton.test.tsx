import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkAsWatchedButton } from "./MarkAsWatchedButton";

// Capture mutation options for direct callback testing
let logMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let deleteMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let _addToWatchlistMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};

const mockLogMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockAddToWatchlistMutate = vi.fn();
const mockInvalidateWatchHistory = vi.fn();
const mockInvalidateWatchlist = vi.fn();

const mockHistoryList = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      watchHistory: {
        list: {
          useQuery: (...args: unknown[]) => mockHistoryList(...args),
        },
        log: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            logMutationOpts = opts;
            return { mutate: mockLogMutate, isPending: false };
          },
        },
        delete: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            deleteMutationOpts = opts;
            return { mutate: mockDeleteMutate, isPending: false };
          },
        },
      },
      watchlist: {
        add: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            _addToWatchlistMutationOpts = opts;
            return { mutate: mockAddToWatchlistMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        watchHistory: {
          list: { invalidate: mockInvalidateWatchHistory },
        },
        watchlist: {
          list: { invalidate: mockInvalidateWatchlist },
        },
      },
    }),
  },
}));

// Capture toast calls
let lastToastSuccessAction: { label: string; onClick: () => void } | undefined;

const mockToastSuccess = vi.fn(
  (message: string, opts?: { action?: { label: string; onClick: () => void } }) => {
    lastToastSuccessAction = opts?.action;
  }
);
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (message: string, opts?: { action?: { label: string; onClick: () => void } }) =>
      mockToastSuccess(message, opts),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function setupNoHistory() {
  mockHistoryList.mockReturnValue({
    data: { data: [], pagination: { total: 0, limit: 100, offset: 0 } },
    isLoading: false,
  });
}

function setupWatched(count = 1) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    watchedAt: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    completed: 1,
  }));
  mockHistoryList.mockReturnValue({
    data: { data: entries, pagination: { total: count, limit: 100, offset: 0 } },
    isLoading: false,
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  logMutationOpts = {};
  deleteMutationOpts = {};
  _addToWatchlistMutationOpts = {};
  lastToastSuccessAction = undefined;

  setupNoHistory();
});

describe("MarkAsWatchedButton", () => {
  describe("initial state", () => {
    it("shows 'Mark as Watched' button when not yet watched", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      expect(screen.getByRole("button", { name: "Mark as watched" })).toBeInTheDocument();
      expect(screen.getByText("Mark as Watched")).toBeInTheDocument();
    });

    it("shows watch count when movie has been watched", () => {
      setupWatched(2);
      render(<MarkAsWatchedButton mediaId={42} />);

      expect(screen.getByText("Watched (2)")).toBeInTheDocument();
    });

    it("shows 'last watched' date when there is history", () => {
      setupWatched(1);
      render(<MarkAsWatchedButton mediaId={42} />);

      expect(screen.getByText(/Last watched/)).toBeInTheDocument();
    });
  });

  describe("logging a watch", () => {
    it("calls log mutation with correct payload on button click", async () => {
      const user = userEvent.setup();
      render(<MarkAsWatchedButton mediaId={42} />);

      await user.click(screen.getByRole("button", { name: "Mark as watched" }));

      expect(mockLogMutate).toHaveBeenCalledWith({
        mediaType: "movie",
        mediaId: 42,
        completed: 1,
      });
    });

    it("shows success toast with undo action after logging", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      // Simulate successful log response
      logMutationOpts.onSuccess!({
        data: { id: 99 },
        watchlistRemoved: false,
        message: "Watch logged",
      });

      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Marked as watched",
        expect.objectContaining({
          duration: 5000,
          action: expect.objectContaining({ label: "Undo" }),
        })
      );
    });

    it("invalidates watch history and watchlist after success", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      logMutationOpts.onSuccess!({
        data: { id: 99 },
        watchlistRemoved: false,
        message: "Watch logged",
      });

      expect(mockInvalidateWatchHistory).toHaveBeenCalled();
      expect(mockInvalidateWatchlist).toHaveBeenCalled();
    });

    it("shows error toast when log fails", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      logMutationOpts.onError!({ message: "Database error" });

      expect(mockToastError).toHaveBeenCalledWith("Failed to log watch: Database error");
    });
  });

  describe("undo", () => {
    it("undo calls delete mutation with the watch entry id", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      logMutationOpts.onSuccess!({
        data: { id: 99 },
        watchlistRemoved: false,
        message: "Watch logged",
      });

      expect(lastToastSuccessAction?.label).toBe("Undo");
      lastToastSuccessAction?.onClick();

      expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 99 }, expect.any(Object));
    });

    it("undo re-adds to watchlist when watchlistRemoved is true", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      logMutationOpts.onSuccess!({
        data: { id: 99 },
        watchlistRemoved: true,
        message: "Watch logged",
      });

      lastToastSuccessAction?.onClick();

      // Simulate delete success, which triggers watchlist re-add
      const deleteSuccessCallback = mockDeleteMutate.mock.calls[0]?.[1]?.onSuccess;
      deleteSuccessCallback?.();

      expect(mockAddToWatchlistMutate).toHaveBeenCalledWith(
        { mediaType: "movie", mediaId: 42 },
        expect.any(Object)
      );
    });

    it("undo does NOT re-add to watchlist when watchlistRemoved is false", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      logMutationOpts.onSuccess!({
        data: { id: 99 },
        watchlistRemoved: false,
        message: "Watch logged",
      });

      lastToastSuccessAction?.onClick();

      const deleteSuccessCallback = mockDeleteMutate.mock.calls[0]?.[1]?.onSuccess;
      deleteSuccessCallback?.();

      expect(mockAddToWatchlistMutate).not.toHaveBeenCalled();
    });

    it("undo shows success toast after delete", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      deleteMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith("Watch entry undone");
    });

    it("undo invalidates watch history on success", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      deleteMutationOpts.onSuccess!();

      expect(mockInvalidateWatchHistory).toHaveBeenCalled();
    });

    it("undo shows error toast on failure", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      deleteMutationOpts.onError!({ message: "Not found" });

      expect(mockToastError).toHaveBeenCalledWith("Failed to undo: Not found");
    });
  });

  describe("custom date picker", () => {
    it("shows date picker toggle button", () => {
      render(<MarkAsWatchedButton mediaId={42} />);

      expect(screen.getByRole("button", { name: "Pick custom watch date" })).toBeInTheDocument();
    });

    it("shows date input after clicking the calendar button", async () => {
      const user = userEvent.setup();
      render(<MarkAsWatchedButton mediaId={42} />);

      await user.click(screen.getByRole("button", { name: "Pick custom watch date" }));

      expect(screen.getByLabelText("Watch date")).toBeInTheDocument();
    });
  });
});
