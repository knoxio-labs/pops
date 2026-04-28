import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

type ApiMediaType = 'movie' | 'tv_show';

interface OptimisticArgs {
  apiMediaType: ApiMediaType;
  mediaId: number;
  utils: ReturnType<typeof trpc.useUtils>;
}

function useAddMutation({ apiMediaType, mediaId, utils }: OptimisticArgs) {
  const { t } = useTranslation('media');
  return trpc.media.watchlist.add.useMutation({
    onMutate: async () => {
      await utils.media.watchlist.status.cancel({ mediaType: apiMediaType, mediaId });
      const previous = utils.media.watchlist.status.getData({ mediaType: apiMediaType, mediaId });
      utils.media.watchlist.status.setData({ mediaType: apiMediaType, mediaId }, () => ({
        onWatchlist: true,
        entryId: -1,
      }));
      return { previous };
    },
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('watchlistToggle.addedToWatchlist'));
    },
    onError: (err: { message: string; data?: { code?: string } | null }, _vars, context) => {
  const { t } = useTranslation('media');
      if (context?.previous !== undefined) {
        utils.media.watchlist.status.setData(
          { mediaType: apiMediaType, mediaId },
          context.previous
        );
      }
      if (err.data?.code === 'CONFLICT') {
        toast.info(t('watchlistToggle.alreadyOnWatchlist'));
      } else {
        toast.error(t('watchlistToggle.failedToAdd', { message: err.message }));
      }
    },
    onSettled: () => {
      void utils.media.watchlist.status.invalidate({ mediaType: apiMediaType, mediaId });
    },
  });
}

function useRemoveMutation({ apiMediaType, mediaId, utils }: OptimisticArgs) {
  const { t } = useTranslation('media');
  return trpc.media.watchlist.remove.useMutation({
    onMutate: async () => {
      await utils.media.watchlist.status.cancel({ mediaType: apiMediaType, mediaId });
      const previous = utils.media.watchlist.status.getData({ mediaType: apiMediaType, mediaId });
      utils.media.watchlist.status.setData({ mediaType: apiMediaType, mediaId }, () => ({
        onWatchlist: false,
        entryId: null,
      }));
      return { previous };
    },
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('watchlistToggle.removedFromWatchlist'));
    },
    onError: (err: { message: string }, _vars, context) => {
  const { t } = useTranslation('media');
      if (context?.previous !== undefined) {
        utils.media.watchlist.status.setData(
          { mediaType: apiMediaType, mediaId },
          context.previous
        );
      }
      toast.error(t('watchlistToggle.failedToRemove', { message: err.message }));
    },
    onSettled: () => {
      void utils.media.watchlist.status.invalidate({ mediaType: apiMediaType, mediaId });
    },
  });
}

export function useWatchlistToggleModel(apiMediaType: ApiMediaType, mediaId: number) {
  const utils = trpc.useUtils();
  const { data: statusData, isLoading: isChecking } = trpc.media.watchlist.status.useQuery(
    { mediaType: apiMediaType, mediaId },
    { staleTime: 30_000 }
  );

  const isOnWatchlist = statusData?.onWatchlist ?? false;
  const watchlistEntryId = statusData?.entryId ?? null;

  const addMutation = useAddMutation({ apiMediaType, mediaId, utils });
  const removeMutation = useRemoveMutation({ apiMediaType, mediaId, utils });

  const isMutating = addMutation.isPending || removeMutation.isPending;

  const handleToggle = () => {
    if (isMutating) return;
    if (isOnWatchlist && watchlistEntryId !== null) {
      removeMutation.mutate({ id: watchlistEntryId });
    } else {
      addMutation.mutate({ mediaType: apiMediaType, mediaId });
    }
  };

  return { isChecking, isOnWatchlist, isMutating, handleToggle };
}
