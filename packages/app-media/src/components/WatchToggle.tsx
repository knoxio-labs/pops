/**
 * WatchToggle — Mark as Watched / Watched / Watch Again button.
 *
 * Queries watch history for the given media item and displays:
 * - Unwatched: "Mark as Watched" outline button
 * - Watched once: "Watched" filled button with date
 * - Watched multiple: "Watched" filled button with count badge + "Watch Again"
 */
import { Button, Badge } from "@pops/ui";
import { Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

export interface WatchToggleProps {
  mediaType: "movie" | "episode";
  mediaId: number;
  className?: string;
}

function formatWatchDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function WatchToggle({
  mediaType,
  mediaId,
  className,
}: WatchToggleProps) {
  const utils = trpc.useUtils();

  const { data: historyData, isLoading } =
    trpc.media.watchHistory.list.useQuery(
      { mediaType, mediaId, limit: 100 },
      { staleTime: 30_000 },
    );

  const watchEntries = historyData?.data ?? [];
  const watchCount = watchEntries.length;
  const isWatched = watchCount > 0;
  const lastWatched = isWatched ? watchEntries[0] : null;

  const logMutation = trpc.media.watchHistory.log.useMutation({
    onSuccess: () => {
      toast.success("Marked as watched");
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
  });

  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
      toast.success("Watch entry removed");
      void utils.media.watchHistory.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to remove: ${err.message}`);
    },
  });

  const isMutating = logMutation.isPending || deleteMutation.isPending;

  const handleMarkWatched = () => {
    if (isMutating) return;
    logMutation.mutate({ mediaType, mediaId });
  };

  const handleUnwatch = () => {
    if (isMutating || !lastWatched) return;
    deleteMutation.mutate({ id: lastWatched.id });
  };

  if (isLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        loading
        loadingText="Checking"
        className={className}
      >
        Loading
      </Button>
    );
  }

  if (!isWatched) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleMarkWatched}
        loading={isMutating}
        loadingText="Saving"
        prefix={<Eye className="h-4 w-4" />}
        aria-label="Mark as watched"
        className={className}
      >
        Mark as Watched
      </Button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Button
        variant="default"
        size="sm"
        onClick={handleUnwatch}
        loading={deleteMutation.isPending}
        loadingText="Removing"
        prefix={<Eye className="h-4 w-4" />}
        aria-label={`Watched${watchCount > 1 ? ` ${watchCount} times` : ""} — click to remove last entry`}
      >
        Watched
        {watchCount > 1 && (
          <Badge
            variant="secondary"
            className="ml-1 text-xs bg-primary-foreground/20 text-primary-foreground"
          >
            {watchCount}
          </Badge>
        )}
      </Button>

      {lastWatched && (
        <span className="text-xs text-muted-foreground">
          {formatWatchDate(lastWatched.watchedAt)}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={handleMarkWatched}
        loading={logMutation.isPending}
        loadingText="Saving"
        prefix={<RotateCcw className="h-3.5 w-3.5" />}
        aria-label="Watch again"
      >
        Watch Again
      </Button>
    </div>
  );
}
