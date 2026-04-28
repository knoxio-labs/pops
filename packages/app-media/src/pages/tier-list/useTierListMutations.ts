import { useTranslation } from 'react-i18next';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { TierMovie } from '../../components/TierListBoard';

function useStaleAndNa({
  movies,
  effectiveDimension,
  refetch,
}: {
  movies: TierMovie[];
  effectiveDimension: number | null;
  refetch: () => void;
}) {
  const { t } = useTranslation('media');
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (
      data: { data: { staleness: number } },
      variables: { mediaType: string; mediaId: number }
    ) => {
  const { t } = useTranslation('media');
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(t('staleAndExclude.markedStale', { title: movie?.title ?? t('common.movie'), times: timesMarked }));
      refetch();
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation({
    onSuccess: () => refetch(),
  });

  const handleNA = useCallback(
    (movieId: number) => {
  const { t } = useTranslation('media');
      if (!effectiveDimension || excludeMutation.isPending) return;
      const movie = movies.find((m) => m.mediaId === movieId);
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId: effectiveDimension },
        {
          onSuccess: () => {
  const { t } = useTranslation('media');
            toast.success(t('staleAndExclude.excludedFromDimension', { title: movie?.title ?? t('common.movie') }));
          },
        }
      );
    },
    [effectiveDimension, excludeMutation, movies]
  );

  return { handleMarkStale, handleNA };
}

function useBlacklistFlow({ movies, refetch }: { movies: TierMovie[]; refetch: () => void }) {
  const { t } = useTranslation('media');
  const utils = trpc.useUtils();
  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data: unknown, variables: { mediaType: string; mediaId: number }) => {
  const { t } = useTranslation('media');
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      toast.success(t('blacklist.markedAsNotWatched', { title: movie?.title ?? t('common.movie') }));
      setBlacklistTarget(null);
      refetch();
      void utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleNotWatched = useCallback(
    (movieId: number) => {
      const movie = movies.find((m) => m.mediaId === movieId);
      if (movie) setBlacklistTarget({ id: movie.mediaId, title: movie.title });
    },
    [movies]
  );

  return { handleNotWatched, blacklistTarget, setBlacklistTarget, blacklistMutation };
}

export function useTierListMutations({
  movies,
  effectiveDimension,
  refetch,
}: {
  movies: TierMovie[];
  effectiveDimension: number | null;
  refetch: () => void;
}) {
  const stale = useStaleAndNa({ movies, effectiveDimension, refetch });
  const blacklist = useBlacklistFlow({ movies, refetch });
  return { ...stale, ...blacklist };
}
