import { useTranslation } from 'react-i18next';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

interface UseDebriefDestructiveActionsArgs {
  movieId: number;
  currentDimensionId: number | null;
  resolveTitle: (id: number) => string;
}

/**
 * markStale, N/A exclude, and blacklist (Not Watched) mutations for the
 * Debrief flow. Returns mutation handlers and blacklist dialog state.
 */
function useStaleAndExclude({
  invalidateDebrief,
  resolveTitle,
  currentDimensionId,
}: {
  invalidateDebrief: () => void;
  resolveTitle: (id: number) => string;
  currentDimensionId: number | null;
}) {
  const { t } = useTranslation('media');
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (data: { data: { staleness: number } }, variables: { mediaId: number }) => {
  const { t } = useTranslation('media');
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(t('staleAndExclude.markedStale', { title: resolveTitle(variables.mediaId), times: timesMarked }));
      invalidateDebrief();
    },
  });

  const handleMarkStale = useCallback(
    (id: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: id });
    },
    [markStaleMutation]
  );

  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation();

  const handleNA = useCallback(
    (id: number) => {
  const { t } = useTranslation('media');
      if (currentDimensionId == null || excludeMutation.isPending) return;
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: id, dimensionId: currentDimensionId },
        {
          onSuccess: () => {
  const { t } = useTranslation('media');
            toast.success(t('staleAndExclude.excludedFromDimension', { title: resolveTitle(id) }));
            invalidateDebrief();
          },
        }
      );
    },
    [currentDimensionId, excludeMutation, resolveTitle, invalidateDebrief]
  );

  return { handleMarkStale, markStaleMutation, handleNA, excludeMutation };
}

function useBlacklistFlow({
  invalidateDebrief,
  resolveTitle,
}: {
  invalidateDebrief: () => void;
  resolveTitle: (id: number) => string;
}) {
  const [blacklistTarget, setBlacklistTarget] = useState<{ id: number; title: string } | null>(
    null
  );

  const { data: blacklistComparisonData } = trpc.media.comparisons.listForMedia.useQuery(
    { mediaType: 'movie', mediaId: blacklistTarget?.id ?? 0, limit: 1 },
    { enabled: blacklistTarget !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data, variables) => {
  const { t } = useTranslation('media');
      toast.success(t('blacklist.markedAsNotWatched', { title: resolveTitle(variables.mediaId) }));
      setBlacklistTarget(null);
      invalidateDebrief();
    },
  });

  const openBlacklist = useCallback((movie: { id: number; title: string }) => {
    setBlacklistTarget(movie);
  }, []);
  const cancelBlacklist = useCallback(() => setBlacklistTarget(null), []);
  const confirmBlacklist = useCallback(() => {
    if (!blacklistTarget) return;
    blacklistMutation.mutate({ mediaType: 'movie', mediaId: blacklistTarget.id });
  }, [blacklistTarget, blacklistMutation]);

  return {
    blacklistTarget,
    comparisonsToPurge,
    blacklistMutation,
    openBlacklist,
    cancelBlacklist,
    confirmBlacklist,
  };
}

export function useDebriefDestructiveActions({
  movieId,
  currentDimensionId,
  resolveTitle,
}: UseDebriefDestructiveActionsArgs) {
  const utils = trpc.useUtils();

  const invalidateDebrief = useCallback(() => {
    void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
  }, [utils, movieId]);

  const stale = useStaleAndExclude({ invalidateDebrief, resolveTitle, currentDimensionId });
  const blacklist = useBlacklistFlow({ invalidateDebrief, resolveTitle });

  return {
    handleMarkStale: stale.handleMarkStale,
    markStalePending: stale.markStaleMutation.isPending,
    handleNA: stale.handleNA,
    naPending: stale.excludeMutation.isPending,
    blacklistTarget: blacklist.blacklistTarget,
    comparisonsToPurge: blacklist.comparisonsToPurge,
    blacklistPending: blacklist.blacklistMutation.isPending,
    openBlacklist: blacklist.openBlacklist,
    cancelBlacklist: blacklist.cancelBlacklist,
    confirmBlacklist: blacklist.confirmBlacklist,
  };
}
