/**
 * Quick Pick — "What to Watch" decision flow.
 * Shows random unwatched movies one at a time.
 * Skip (left) or Add to Watchlist (right).
 */
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button, Skeleton, Badge } from "@pops/ui";
import { ArrowLeft, SkipForward, Plus, Sparkles } from "lucide-react";
import { trpc } from "../lib/trpc";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

function buildPosterUrl(posterPath: string | null): string | null {
  if (!posterPath) return null;
  if (posterPath.startsWith("/")) return `${TMDB_IMAGE_BASE}${posterPath}`;
  return posterPath;
}

export function QuickPickPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const utils = trpc.useUtils();

  const { data, isLoading, error, refetch } =
    trpc.media.discovery.quickPick.useQuery({ count: 10 });

  const addToWatchlist = trpc.media.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success("Added to watchlist!");
      void utils.media.watchlist.list.invalidate();
      nextCard();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.info("Already on watchlist");
        nextCard();
      } else {
        toast.error(`Failed to add: ${err.message}`);
      }
    },
  });

  const movies = data?.data ?? [];
  const currentMovie = movies[currentIndex];
  const isFinished = currentIndex >= movies.length && movies.length > 0;

  const nextCard = () => {
    setCurrentIndex((i) => i + 1);
  };

  const handleSkip = () => {
    nextCard();
  };

  const handleAdd = () => {
    if (!currentMovie) return;
    addToWatchlist.mutate({ mediaType: "movie", mediaId: currentMovie.id });
  };

  const handleRefresh = () => {
    setCurrentIndex(0);
    void refetch();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center p-6 max-w-md mx-auto">
        <Skeleton className="aspect-[2/3] w-full max-w-sm rounded-xl" />
        <Skeleton className="h-8 w-48 mt-4" />
        <Skeleton className="h-4 w-32 mt-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive mb-4">Failed to load recommendations</p>
        <Button onClick={() => void refetch()}>Try Again</Button>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="p-6 text-center max-w-md mx-auto">
        <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">No picks available</h2>
        <p className="text-muted-foreground mb-4">
          All movies in your library are either watched or on your watchlist.
          Add more movies to get recommendations!
        </p>
        <Link to="/media">
          <Button>Back to Library</Button>
        </Link>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="p-6 text-center max-w-md mx-auto">
        <Sparkles className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-bold mb-2">All done!</h2>
        <p className="text-muted-foreground mb-4">
          You&apos;ve gone through all the picks. Want more?
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={handleRefresh}>Get More Picks</Button>
          <Link to="/media">
            <Button variant="outline">Back to Library</Button>
          </Link>
        </div>
      </div>
    );
  }

  const posterUrl = buildPosterUrl(currentMovie.posterPath);
  const year = currentMovie.releaseDate?.slice(0, 4);
  const genres: string[] = currentMovie.genres
    ? JSON.parse(currentMovie.genres)
    : [];

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/media">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Quick Pick
        </h1>
        <span className="text-sm text-muted-foreground ml-auto">
          {currentIndex + 1} / {movies.length}
        </span>
      </div>

      {/* Movie Card */}
      <div className="rounded-xl overflow-hidden border shadow-lg mb-6">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={currentMovie.title}
            className="w-full aspect-[2/3] object-cover"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
            <span className="text-muted-foreground">No poster</span>
          </div>
        )}

        <div className="p-4 space-y-2">
          <h2 className="text-lg font-bold">{currentMovie.title}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {year && <span>{year}</span>}
            {currentMovie.runtime && <span>· {currentMovie.runtime} min</span>}
            {currentMovie.voteAverage !== null && (
              <span>· ★ {currentMovie.voteAverage.toFixed(1)}</span>
            )}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genres.slice(0, 3).map((g) => (
                <Badge key={g} variant="secondary" className="text-xs">
                  {g}
                </Badge>
              ))}
            </div>
          )}
          {currentMovie.overview && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {currentMovie.overview}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleSkip}
          size="lg"
        >
          <SkipForward className="h-4 w-4 mr-2" />
          Skip
        </Button>
        <Button
          className="flex-1"
          onClick={handleAdd}
          loading={addToWatchlist.isPending}
          loadingText="Adding..."
          size="lg"
        >
          <Plus className="h-4 w-4 mr-2" />
          Watchlist
        </Button>
      </div>
    </div>
  );
}
