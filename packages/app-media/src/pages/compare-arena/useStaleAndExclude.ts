import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface Args {
  dimensionId: number | null;
  utils: ReturnType<typeof trpc.useUtils>;
  resolveTitle: (id: number) => string;
  onAfterAction: () => void;
}

export function useStaleAndExcludeMutations({
  dimensionId,
  utils,
  resolveTitle,
  onAfterAction,
}: Args) {
  const { t } = useTranslation('media');
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (data: { data: { staleness: number } }, variables: { mediaId: number }) => {
  const { t } = useTranslation('media');
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(t('staleAndExclude.markedStale', { title: resolveTitle(variables.mediaId), times: timesMarked }));
      onAfterAction();
      void utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation();

  const handleNA = useCallback(
    (movieId: number) => {
  const { t } = useTranslation('media');
      if (!dimensionId || excludeMutation.isPending) return;
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId },
        {
          onSuccess: () => {
  const { t } = useTranslation('media');
            toast.success(t('staleAndExclude.excludedFromDimension', { title: resolveTitle(movieId) }));
            void utils.media.comparisons.getSmartPair.invalidate();
          },
        }
      );
    },
    [dimensionId, excludeMutation, resolveTitle, utils]
  );

  return { markStaleMutation, handleMarkStale, excludeMutation, handleNA };
}
