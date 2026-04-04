import { useState, useEffect } from "react";
import { Button, Skeleton } from "@pops/ui";
import { ImageOff, ListOrdered, RefreshCw } from "lucide-react";
import { trpc } from "../lib/trpc";

export function TierListPage() {
  const [dimensionId, setDimensionId] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = dimensionsData?.data?.filter((d: { active: boolean }) => d.active) ?? [];

  // Auto-select first active dimension
  useEffect(() => {
    if (dimensionId === null && activeDimensions.length > 0) {
      setDimensionId(activeDimensions[0]?.id ?? null);
    }
  }, [activeDimensions, dimensionId]);

  const {
    data: moviesData,
    isLoading: moviesLoading,
    refetch: refetchMovies,
    isFetching,
  } = trpc.media.comparisons.getTierListMovies.useQuery(
    { dimensionId: dimensionId! },
    {
      enabled: dimensionId !== null,
      refetchOnWindowFocus: false,
      gcTime: 0,
      staleTime: 0,
    }
  );

  const movies = moviesData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Tier List</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchMovies()}
          disabled={isFetching || dimensionId === null}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Dimension selector chips */}
      {dimsLoading ? (
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      ) : activeDimensions.length === 0 ? (
        <p className="text-muted-foreground">No dimensions configured yet.</p>
      ) : (
        <div className="flex gap-2 flex-wrap" role="tablist">
          {activeDimensions.map((dim: { id: number; name: string }) => (
            <button
              key={dim.id}
              role="tab"
              aria-selected={dim.id === dimensionId}
              onClick={() => setDimensionId(dim.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                dim.id === dimensionId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {dim.name}
            </button>
          ))}
        </div>
      )}

      {/* Movie pool */}
      {dimensionId === null ? null : moviesLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : movies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ListOrdered className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No movies available for this dimension.</p>
          <p className="text-sm mt-1">Watch and compare more movies to populate the tier list.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {movies.map((movie: { id: number; title: string; posterUrl: string | null }) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}
    </div>
  );
}

function MovieCard({ movie }: { movie: { id: number; title: string; posterUrl: string | null } }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col items-center text-center rounded-lg border p-3 bg-card">
      {movie.posterUrl && !imgError ? (
        <img
          src={movie.posterUrl}
          alt={`${movie.title} poster`}
          className="w-full aspect-[2/3] rounded-md object-cover mb-2"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full aspect-[2/3] rounded-md mb-2 bg-muted flex items-center justify-center">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium line-clamp-2">{movie.title}</p>
    </div>
  );
}
