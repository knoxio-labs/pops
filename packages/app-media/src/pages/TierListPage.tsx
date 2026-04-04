/**
 * TierListPage — dimension selector + unranked movie pool for tier placement.
 *
 * Loads up to 8 movies from getTierListMovies and displays them as
 * draggable cards in an unranked pool. Dimension can be switched via chips.
 * After placing movies in tiers, submit to record pairwise comparisons.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { Alert, AlertTitle, AlertDescription, Button, Skeleton, cn } from "@pops/ui";
import { LayoutGrid, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { useTierListSubmit, type Tier, type TierPlacement } from "../hooks/useTierListSubmit";
import { TierListSummary } from "../components/TierListSummary";

function MovieCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 w-28">
      <Skeleton className="w-28 aspect-[2/3] rounded-lg" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function PoolSkeleton() {
  return (
    <div className="flex flex-wrap justify-center gap-4 py-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
}

interface TierListMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

interface MovieCardProps {
  movie: TierListMovie;
  onDragStart: (e: React.DragEvent, movie: TierListMovie) => void;
}

function MovieCard({ movie, onDragStart }: MovieCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, movie)}
      className="flex flex-col items-center gap-1.5 w-28 cursor-grab active:cursor-grabbing select-none group"
      role="listitem"
      aria-label={movie.title}
    >
      <div className="relative w-28 aspect-[2/3] rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary/50 transition-colors bg-muted">
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <LayoutGrid className="h-8 w-8" />
          </div>
        )}
      </div>
      <span className="text-xs text-center leading-tight line-clamp-2 max-w-full">
        {movie.title}
      </span>
    </div>
  );
}

const TIERS: Tier[] = ["S", "A", "B", "C", "D"];

const TIER_COLORS: Record<Tier, string> = {
  S: "bg-red-500/20 border-red-500/40 text-red-700 dark:text-red-400",
  A: "bg-orange-500/20 border-orange-500/40 text-orange-700 dark:text-orange-400",
  B: "bg-yellow-500/20 border-yellow-500/40 text-yellow-700 dark:text-yellow-400",
  C: "bg-green-500/20 border-green-500/40 text-green-700 dark:text-green-400",
  D: "bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-400",
};

function TierRow({
  tier,
  movies,
  onDrop,
  onDragStart,
}: {
  tier: Tier;
  movies: TierListMovie[];
  onDrop: (tier: Tier, movie: TierListMovie) => void;
  onDragStart: (e: React.DragEvent, movie: TierListMovie) => void;
}) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      try {
        const movie = JSON.parse(e.dataTransfer.getData("application/json")) as TierListMovie;
        onDrop(tier, movie);
      } catch {
        // ignore invalid drag data
      }
    },
    [tier, onDrop]
  );

  return (
    <div className="flex gap-2 min-h-[80px]">
      <div
        className={cn(
          "flex items-center justify-center w-12 shrink-0 rounded-l-lg border-2 font-bold text-lg",
          TIER_COLORS[tier]
        )}
      >
        {tier}
      </div>
      <div
        className="flex-1 flex flex-wrap items-center gap-2 p-2 rounded-r-lg border border-dashed border-border bg-muted/20 min-h-[80px]"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="list"
        aria-label={`Tier ${tier}`}
      >
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  );
}

function UnrankedPool({
  dimensionId,
  onSubmit,
  isPending,
}: {
  dimensionId: number;
  onSubmit: (dimensionId: number, placements: TierPlacement[]) => void;
  isPending: boolean;
}) {
  const { data, isLoading, error, refetch, isFetching } =
    trpc.media.comparisons.getTierListMovies.useQuery({ dimensionId }, { staleTime: Infinity });

  const [tierAssignments, setTierAssignments] = useState<Map<number, Tier>>(new Map());

  const handleDragStart = useCallback((e: React.DragEvent, movie: TierListMovie) => {
    e.dataTransfer.setData("application/json", JSON.stringify(movie));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback((tier: Tier, movie: TierListMovie) => {
    setTierAssignments((prev) => {
      const next = new Map(prev);
      next.set(movie.id, tier);
      return next;
    });
  }, []);

  const handleReturnToPool = useCallback((_e: React.DragEvent, movie: TierListMovie) => {
    // When dragged back to pool, remove tier assignment
  }, []);

  const handlePoolDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    try {
      const movie = JSON.parse(e.dataTransfer.getData("application/json")) as TierListMovie;
      setTierAssignments((prev) => {
        const next = new Map(prev);
        next.delete(movie.id);
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  const handlePoolDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const movies: TierListMovie[] = useMemo(() => data?.data ?? [], [data]);

  const unrankedMovies = useMemo(
    () => movies.filter((m) => !tierAssignments.has(m.id)),
    [movies, tierAssignments]
  );

  const tierMovies = useMemo(() => {
    const map: Record<Tier, TierListMovie[]> = { S: [], A: [], B: [], C: [], D: [] };
    for (const movie of movies) {
      const tier = tierAssignments.get(movie.id);
      if (tier) map[tier].push(movie);
    }
    return map;
  }, [movies, tierAssignments]);

  const placedCount = tierAssignments.size;

  const handleSubmit = useCallback(() => {
    const placements: TierPlacement[] = [];
    for (const [movieId, tier] of tierAssignments) {
      placements.push({ movieId, tier });
    }
    onSubmit(dimensionId, placements);
  }, [tierAssignments, dimensionId, onSubmit]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load movies for tier list.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) return <PoolSkeleton />;

  if (movies.length === 0) {
    return (
      <div className="text-center py-16">
        <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">
          No eligible movies for this dimension. Compare more movies or check your exclusions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tier rows */}
      <div className="space-y-2">
        {TIERS.map((tier) => (
          <TierRow
            key={tier}
            tier={tier}
            movies={tierMovies[tier]}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
          />
        ))}
      </div>

      {/* Unranked pool */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Unranked ({unrankedMovies.length})
          </h2>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            aria-label="Refresh movie pool"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div
          className="flex flex-wrap justify-center gap-4 p-4 rounded-xl border border-dashed border-border bg-muted/30"
          role="list"
          aria-label="Unranked movies"
          onDragOver={handlePoolDragOver}
          onDrop={handlePoolDrop}
        >
          {unrankedMovies.length > 0 ? (
            unrankedMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} onDragStart={handleDragStart} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              All movies placed! Submit your tier list.
            </p>
          )}
        </div>
      </div>

      {/* Submit button */}
      <div className="flex justify-center">
        <Button onClick={handleSubmit} disabled={placedCount < 2 || isPending} className="gap-2">
          <Send className="h-4 w-4" />
          {isPending ? "Submitting..." : `Submit Tier List (${placedCount} movies)`}
        </Button>
      </div>
    </div>
  );
}

export function TierListPage() {
  const navigate = useNavigate();
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d: { active: boolean }) => d.active),
    [dimensionsData?.data]
  );

  // Auto-select first dimension once loaded
  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  // Build movieId → title map from the tier list movies query
  const { data: tierMoviesData } = trpc.media.comparisons.getTierListMovies.useQuery(
    { dimensionId: effectiveDimension! },
    { enabled: effectiveDimension != null, staleTime: Infinity }
  );

  const movieTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of tierMoviesData?.data ?? []) {
      map.set(m.id, m.title);
    }
    return map;
  }, [tierMoviesData]);

  const {
    submit,
    result,
    reset,
    isPending,
    error: submitError,
  } = useTierListSubmit({
    movieTitles,
    onSuccess: () => {
      toast.success("Tier list submitted!");
    },
  });

  const handleDimensionChange = useCallback(
    (dimId: number) => {
      setSelectedDimension(dimId);
      reset();
    },
    [reset]
  );

  const handleDoAnother = useCallback(() => {
    reset();
  }, [reset]);

  const handleDone = useCallback(() => {
    navigate("/media/compare");
  }, [navigate]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <LayoutGrid className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold">Tier List</h1>
      </div>

      {dimsLoading ? (
        <PoolSkeleton />
      ) : activeDimensions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No active dimensions. Create one to get started.</p>
        </div>
      ) : (
        <>
          <div
            className="flex flex-wrap justify-center gap-2"
            role="tablist"
            aria-label="Dimension selector"
          >
            {activeDimensions.map((dim: { id: number; name: string }) => (
              <button
                key={dim.id}
                role="tab"
                aria-selected={effectiveDimension === dim.id}
                onClick={() => handleDimensionChange(dim.id)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  effectiveDimension === dim.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                {dim.name}
              </button>
            ))}
          </div>

          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>Submission Failed</AlertTitle>
              <AlertDescription>{submitError.message}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <TierListSummary
              comparisonsRecorded={result.comparisonsRecorded}
              scoreChanges={result.scoreChanges}
              onDoAnother={handleDoAnother}
              onDone={handleDone}
            />
          ) : (
            effectiveDimension && (
              <UnrankedPool
                dimensionId={effectiveDimension}
                onSubmit={submit}
                isPending={isPending}
              />
            )
          )}
        </>
      )}
    </div>
  );
}
