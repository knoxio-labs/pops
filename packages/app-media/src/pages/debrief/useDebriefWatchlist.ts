import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseDebriefWatchlistArgs {
  enabled: boolean;
  resolveTitle: (mediaId: number) => string;
}

export function useDebriefWatchlist({ enabled, resolveTitle }: UseDebriefWatchlistArgs) {
  const { t } = useTranslation('media');
  const utils = trpc.useUtils();

  const { data: watchlistData } = trpc.media.watchlist.list.useQuery(
    { mediaType: 'movie' },
    { enabled }
  );

  const watchlistedMovies = useMemo(
    () =>
      new Map(
        (watchlistData?.data ?? [])
          .filter((e: { mediaType: string }) => e.mediaType === 'movie')
          .map((e: { mediaId: number; id: number }) => [e.mediaId, e.id])
      ),
    [watchlistData]
  );

  const addMutation = trpc.media.watchlist.add.useMutation({
    onSuccess: (_data, variables) => {
  const { t } = useTranslation('media');
      void utils.media.watchlist.list.invalidate();
      toast.success(t('debrief.addedToWatchlist', { title: resolveTitle(variables.mediaId) }));
    },
  });

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: (_data, variables) => {
  const { t } = useTranslation('media');
      void utils.media.watchlist.list.invalidate();
      const mediaId = [...watchlistedMovies.entries()].find(
        ([, entryId]) => entryId === variables.id
      )?.[0];
      toast.success(t('debrief.removedFromWatchlist', { title: mediaId != null ? resolveTitle(mediaId) : t('common.movie') }));
    },
  });

  const handleToggleWatchlist = useCallback(
    (mediaId: number) => {
      const entryId = watchlistedMovies.get(mediaId);
      if (entryId !== undefined) {
        removeMutation.mutate({ id: entryId });
      } else {
        addMutation.mutate({ mediaType: 'movie', mediaId });
      }
    },
    [watchlistedMovies, addMutation, removeMutation]
  );

  return {
    watchlistedMovies,
    handleToggleWatchlist,
    pending: addMutation.isPending || removeMutation.isPending,
  };
}
