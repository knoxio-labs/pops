/**
 * TierListPage — dimension selector + TierListBoard for drag-and-drop tier placement.
 *
 * Loads up to 8 movies from getTierListMovies and renders them via TierListBoard.
 * Dimension can be switched via chips. After placing movies in tiers, submit to
 * record pairwise comparisons.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { Alert, AlertTitle, AlertDescription, Skeleton, cn } from "@pops/ui";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { useTierListSubmit } from "../hooks/useTierListSubmit";
import { TierListBoard, type TierMovie, type Tier } from "../components/TierListBoard";
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

export function TierListPage() {
  const navigate = useNavigate();
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d: { active: boolean }) => d.active),
    [dimensionsData?.data]
  );

  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  const {
    data: tierMoviesData,
    isLoading: moviesLoading,
    error: moviesError,
    refetch,
    isFetching,
  } = trpc.media.comparisons.getTierListMovies.useQuery(
    { dimensionId: effectiveDimension! },
    { enabled: effectiveDimension != null, staleTime: Infinity }
  );

  const movies: TierMovie[] = useMemo(
    () =>
      (tierMoviesData?.data ?? []).map((m) => ({
        mediaType: "movie" as const,
        mediaId: m.id,
        title: m.title,
        posterUrl: m.posterUrl,
        score: m.score,
        comparisonCount: m.comparisonCount,
      })),
    [tierMoviesData]
  );

  const movieTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of movies) {
      map.set(m.mediaId, m.title);
    }
    return map;
  }, [movies]);

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
    navigate("/media/rankings");
  }, [navigate]);

  const handleSubmit = useCallback(
    (placements: Array<{ movieId: number; tier: Tier }>) => {
      if (effectiveDimension != null) {
        submit(effectiveDimension, placements);
      }
    },
    [effectiveDimension, submit]
  );

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
              <div className="space-y-3">
                <div className="flex justify-end">
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

                {moviesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>Failed to load movies for tier list.</AlertDescription>
                  </Alert>
                ) : moviesLoading ? (
                  <PoolSkeleton />
                ) : movies.length === 0 ? (
                  <div className="text-center py-16">
                    <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                    <p className="text-muted-foreground">
                      No eligible movies for this dimension. Compare more movies or check your
                      exclusions.
                    </p>
                  </div>
                ) : (
                  <TierListBoard movies={movies} onSubmit={handleSubmit} submitPending={isPending} />
                )}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
