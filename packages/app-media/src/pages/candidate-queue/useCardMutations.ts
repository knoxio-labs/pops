import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { Candidate } from './CandidateCard';

export function useCardMutations(candidate: Candidate, setPopoverOpen: (v: boolean) => void) {
  const { t } = useTranslation('media');
  const utils = trpc.useUtils();
  const downloadMutation = trpc.media.rotation.downloadCandidate.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('candidateQueue.downloading', { title: candidate.title }));
      void utils.media.rotation.listCandidates.invalidate();
    },
    onError: (err) => toast.error(err.message || t('candidateQueue.failedToDownload')),
  });
  const excludeMutation = trpc.media.rotation.excludeCandidate.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('candidateQueue.excluded', { title: candidate.title }));
      void utils.media.rotation.listCandidates.invalidate();
      void utils.media.rotation.listExclusions.invalidate();
      setPopoverOpen(false);
    },
    onError: (err) => toast.error(err.message || t('candidateQueue.failedToExclude')),
  });
  const unexcludeMutation = trpc.media.rotation.removeExclusion.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('candidateQueue.restored', { title: candidate.title }));
      void utils.media.rotation.listCandidates.invalidate();
      void utils.media.rotation.listExclusions.invalidate();
    },
    onError: (err) => toast.error(err.message || t('candidateQueue.failedToRestore')),
  });
  return { downloadMutation, excludeMutation, unexcludeMutation };
}
