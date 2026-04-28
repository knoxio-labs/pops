import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function useUndoMutation(mediaId: number, t: TFn) {
  const { t } = useTranslation('media');
  const utils = trpc.useUtils();
  const addToWatchlistMutation = trpc.media.watchlist.add.useMutation();
  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
  const { t } = useTranslation('media');
      toast.success(t('markAsWatched.watchEntryUndone'));
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
  const { t } = useTranslation('media');
      toast.error(t('markAsWatched.failedToUndo', { message: err.message }));
    },
  });

  const handleUndo = (entryId: number, watchlistRemoved: boolean) => {
    deleteMutation.mutate(
      { id: entryId },
      {
        onSuccess: () => {
          if (watchlistRemoved) {
            addToWatchlistMutation.mutate(
              { mediaType: 'movie', mediaId },
              {
                onSuccess: () => {
                  void utils.media.watchlist.list.invalidate();
                },
              }
            );
          }
        },
      }
    );
  };

  return handleUndo;
}

function useLogMutation({
  handleUndo,
  setShowDatePicker,
  setCustomDate,
  t,
}: {
  handleUndo: (id: number, removed: boolean) => void;
  setShowDatePicker: (v: boolean) => void;
  setCustomDate: (v: string) => void;
  t: TFn;
}) {
  const utils = trpc.useUtils();
  return trpc.media.watchHistory.log.useMutation({
    onSuccess: (result: { data: { id: number }; watchlistRemoved: boolean }) => {
  const { t } = useTranslation('media');
      toast.success(t('markAsWatched.markedAsWatched'), {
        duration: 5000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            handleUndo(result.data.id, result.watchlistRemoved);
          },
        },
      });
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchlist.list.invalidate();
      void utils.media.comparisons.getPendingDebriefs.invalidate();
      setShowDatePicker(false);
      setCustomDate('');
    },
    onError: (err: { message: string }) => {
  const { t } = useTranslation('media');
      toast.error(t('markAsWatched.failedToLogWatch', { message: err.message }));
    },
  });
}

export function useMarkAsWatched(mediaId: number) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const { data: historyData } = trpc.media.watchHistory.list.useQuery(
    { mediaType: 'movie', mediaId, limit: 100 },
    { staleTime: 30_000 }
  );

  const watchCount = historyData?.data?.length ?? 0;
  const lastWatched = historyData?.data?.[0]?.watchedAt;

  const handleUndo = useUndoMutation(mediaId, t);
  const logMutation = useLogMutation({ handleUndo, setShowDatePicker, setCustomDate, t });

  const handleMarkWatched = () => {
    logMutation.mutate({ mediaType: 'movie', mediaId, completed: 1 });
  };

  const handleMarkWatchedWithDate = () => {
    if (!customDate) return;
    logMutation.mutate({
      mediaType: 'movie',
      mediaId,
      watchedAt: new Date(customDate).toISOString(),
      completed: 1,
    });
  };

  return {
    showDatePicker,
    setShowDatePicker,
    customDate,
    setCustomDate,
    watchCount,
    lastWatched,
    logMutation,
    handleMarkWatched,
    handleMarkWatchedWithDate,
  };
}
