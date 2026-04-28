import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

export function useRotationButtonsModel(tmdbId: number) {
  const { t } = useTranslation('media');
  const utils = trpc.useUtils();

  const { data: configData } = trpc.media.arr.getConfig.useQuery();
  const radarrConfigured = configData?.data?.radarrConfigured === true;

  const movieStatus = trpc.media.arr.getMovieStatus.useQuery(
    { tmdbId },
    { enabled: radarrConfigured }
  );

  const { data: candidateData, isLoading: candidateLoading } =
    trpc.media.rotation.getCandidateStatus.useQuery({ tmdbId });

  const addToQueueMutation = trpc.media.rotation.addToQueue.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('movieActions.addedToRotationQueue'));
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error(t('movieActions.failedToAddToQueue')),
  });

  const removeFromQueueMutation = trpc.media.rotation.removeFromQueue.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('movieActions.removedFromQueue'));
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error(t('movieActions.failedToRemoveFromQueue')),
  });

  const removeExclusionMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('movieActions.exclusionRemoved'));
      void utils.media.rotation.getCandidateStatus.invalidate({ tmdbId });
    },
    onError: () => toast.error(t('movieActions.failedToRemoveExclusion')),
  });

  return {
    radarrConfigured,
    movieStatus,
    candidateData,
    candidateLoading,
    addToQueueMutation,
    removeFromQueueMutation,
    removeExclusionMutation,
  };
}
