import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { WatchlistEntry } from './types';

interface MutationsArgs {
  setIsReordering: (v: boolean) => void;
  setOptimisticOrder: (v: WatchlistEntry[] | null) => void;
}

export function useWatchlistMutations({ setIsReordering, setOptimisticOrder }: MutationsArgs) {
  const { t } = useTranslation('media');
  const utils = trpc.useUtils();
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      setRemovingId(null);
      toast.success(t('watchlist.removedFromWatchlist'));
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
  const { t } = useTranslation('media');
      setRemovingId(null);
      toast.error(t('watchlist.failedToRemove', { message: err.message }));
    },
  });

  const updateMutation = trpc.media.watchlist.update.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success(t('watchlist.notesSaved'));
      void utils.media.watchlist.list.invalidate();
    },
    onError: (error: { message: string }) => {
  const { t } = useTranslation('media');
      setUpdateErrorMsg(error.message ?? t('watchlist.failedToSaveNotes', { message: '' }));
      toast.error(t('watchlist.failedToSaveNotes', { message: error.message }));
    },
  });

  const reorderMutation = trpc.media.watchlist.reorder.useMutation({
    onSuccess: () => {
      setOptimisticOrder(null);
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
  const { t } = useTranslation('media');
      setOptimisticOrder(null);
      toast.error(t('watchlist.failedToReorder', { message: err.message }));
    },
    onSettled: () => {
      setIsReordering(false);
    },
  });

  return {
    removeMutation,
    updateMutation,
    reorderMutation,
    removingId,
    setRemovingId,
    updateErrorId,
    setUpdateErrorId,
    updateErrorMsg,
    setUpdateErrorMsg,
  };
}
